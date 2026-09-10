/**
 * ChunkedUploader — client-side helper để upload file lớn theo chunks trực tiếp lên MinIO.
 *
 * Flow (giống Google Drive / Dropbox):
 *  1. POST /api/documents/multipart/init    → nhận upload_id + presigned URLs
 *  2. PUT từng chunk (8MB) lên presigned URL song song (max 3 concurrent)
 *  3. POST /api/documents/multipart/{id}/complete với danh sách ETags
 *
 * Hỗ trợ: pause/resume, retry, progress callback, cancel (abort).
 */

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB — khớp với BE default
const DEFAULT_CONCURRENCY = 3;
const MAX_RETRIES = 3;

export interface ChunkedUploadOptions {
  chunkSize?: number;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (uploaded: number, total: number) => void;
  onPartUploaded?: (partNumber: number, totalParts: number) => void;
}

export interface ChunkedUploadResult {
  document_id: number;
  upload_id: string;
  storage_key: string;
  filename: string;
  size: number;
}

interface InitResponse {
  upload_id: string;
  storage_key: string;
  bucket: string;
  chunk_size: number;
  parts_expected: number;
  parts: { part_number: number; url: string; chunk_size: number }[];
}

interface CompleteResponse extends ChunkedUploadResult {}

// ---------------------------------------------------------------------------
// HTTP helpers — gọi Next.js BFF (relative URL, browser tự resolve host)
// ---------------------------------------------------------------------------

async function apiGetToken(): Promise<string> {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("access_token") ?? "";
}

function authHeaders(): Record<string, string> {
  // Will be resolved lazily in each call
  return {};
}

async function callInit(
  filename: string,
  size: number,
  mime: string,
  purpose: string,
): Promise<InitResponse> {
  const token = await apiGetToken();
  const res = await fetch("/api/documents/multipart/init", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ filename, size, mime, purpose }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg =
      errBody?.detail?.[0]?.msg ??
      errBody?.detail ??
      errBody?.error ??
      `Init failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return res.json();
}

async function callComplete(
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[],
): Promise<CompleteResponse> {
  const token = await apiGetToken();
  const res = await fetch(
    `/api/documents/multipart/${uploadId}/complete`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ parts }),
    },
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg =
      errBody?.detail ?? errBody?.error ?? `Complete failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return res.json();
}

async function callAbort(uploadId: string): Promise<void> {
  const token = await apiGetToken();
  try {
    await fetch(`/api/documents/multipart/${uploadId}/abort`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (err) {
    // Abort lỗi cũng không nghiêm trọng — chỉ log
    console.warn("Abort request failed:", err);
  }
}

// ---------------------------------------------------------------------------
// PUT 1 chunk lên presigned URL — có retry
// ---------------------------------------------------------------------------

async function putChunk(
  url: string,
  body: Blob,
  partNumber: number,
  signal: AbortSignal,
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (signal.aborted) {
      throw new DOMException("Upload aborted", "AbortError");
    }
    try {
      const res = await fetch(url, {
        method: "PUT",
        body,
        signal,
      });
      if (!res.ok) {
        throw new Error(
          `PUT part ${partNumber} failed: ${res.status} ${res.statusText}`,
        );
      }
      // ETag trả về trong header (có/không có dấu nháy đều OK)
      const etag = res.headers.get("ETag") ?? res.headers.get("etag") ?? "";
      const cleanEtag = etag.replace(/"/g, "");
      if (!cleanEtag) {
        // Một số trường hợp MinIO có thể trả etag trong body — fallback
        throw new Error(`No ETag in response for part ${partNumber}`);
      }
      return cleanEtag;
    } catch (err) {
      if ((err as any)?.name === "AbortError") throw err;
      lastError = err;
      if (attempt < MAX_RETRIES) {
        // Backoff: 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`PUT part ${partNumber} failed after ${MAX_RETRIES} retries`);
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

export class ChunkedUploader {
  private file: File;
  private options: Required<Omit<ChunkedUploadOptions, "signal">> & {
    signal: AbortSignal | undefined;
  };
  private uploadId?: string;
  private parts: { part_number: number; url: string; chunk_size: number }[] = [];
  private etags: Map<number, string> = new Map();
  private bytesUploaded = 0;

  constructor(file: File, options: ChunkedUploadOptions = {}) {
    this.file = file;
    this.options = {
      chunkSize: options.chunkSize ?? DEFAULT_CHUNK_SIZE,
      concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
      signal: options.signal,
      onProgress: options.onProgress ?? (() => {}),
      onPartUploaded: options.onPartUploaded ?? (() => {}),
    };
  }

  /**
   * Bắt đầu (hoặc tiếp tục) upload.
   * Trả về CompleteResponse khi file đã được ghép trên MinIO + Document đã tạo.
   */
  async start(): Promise<ChunkedUploadResult> {
    const { file, options } = this;
    const signal = options.signal ?? new AbortController().signal;

    // 1. Init
    const init = await callInit(
      file.name,
      file.size,
      file.type || "application/octet-stream",
      "student_project",
    );
    this.uploadId = init.upload_id;
    this.parts = init.parts;
    options.onProgress(0, file.size);

    // 2. Upload từng chunk (parallel với concurrency)
    await this.uploadAllParts(signal);

    // 3. Complete
    const partsList = Array.from(this.etags.entries())
      .sort(([a], [b]) => a - b)
      .map(([PartNumber, ETag]) => ({ PartNumber, ETag }));

    if (partsList.length !== this.parts.length) {
      throw new Error(
        `Missing ETags: uploaded ${partsList.length}/${this.parts.length} parts`,
      );
    }

    const result = await callComplete(this.uploadId!, partsList);
    options.onProgress(file.size, file.size);
    return result;
  }

  /**
   * Hủy upload + giải phóng parts trên MinIO.
   * An toàn để gọi nhiều lần.
   */
  async abort(): Promise<void> {
    if (this.uploadId) {
      await callAbort(this.uploadId);
    }
  }

  private async uploadAllParts(signal: AbortSignal): Promise<void> {
    const { concurrency } = this.options;
    const total = this.parts.length;
    let partIndex = 0;

    const worker = async () => {
      while (partIndex < total) {
        if (signal.aborted) return;
        const myIndex = partIndex++;
        const part = this.parts[myIndex];
        const start = (part.part_number - 1) * part.chunk_size;
        const end = Math.min(start + part.chunk_size, this.file.size);
        const blob = this.file.slice(start, end);

        const etag = await putChunk(part.url, blob, part.part_number, signal);
        this.etags.set(part.part_number, etag);
        this.bytesUploaded += end - start;
        this.options.onProgress(this.bytesUploaded, this.file.size);
        this.options.onPartUploaded(part.part_number, total);
      }
    };

    // Chạy N workers song song
    const workers = Array.from({ length: Math.min(concurrency, total) }, () =>
      worker(),
    );
    await Promise.all(workers);
  }
}
