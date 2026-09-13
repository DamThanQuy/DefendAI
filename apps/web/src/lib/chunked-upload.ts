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
// Retry mỗi part: tăng lên 8 lần với backoff luỹ thừa chặn ở 30s để chịu được
// các lần rớt mạng/DNS chập chờn ngắn khi upload file lớn (vài GB) kéo dài.
const MAX_RETRIES = 8;
const MAX_BACKOFF_MS = 30_000;

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

interface StatusResponse {
  upload_id: string;
  status: string; // pending | completed | aborted
  parts_expected: number;
  parts_received: number;
  document_id?: number | null;
  uploaded_parts: { PartNumber: number; ETag: string; Size: number }[];
}

/**
 * Metadata của một session upload đã khởi tạo, lưu ở localStorage để có thể
 * resume (tiếp tục) sau khi rớt mạng / reload trang mà không phải upload lại
 * từ đầu. Khoá tra theo danh tính file (tên + kích thước + sửa đổi lần cuối).
 */
interface ResumeState {
  uploadId: string;
  chunkSize: number;
  partsExpected: number;
}

const RESUME_STORAGE_PREFIX = "defendai:chunked-upload:";

function resumeKeyFor(file: File): string {
  return `${RESUME_STORAGE_PREFIX}${file.name}:${file.size}:${file.lastModified}`;
}

function loadResumeState(file: File): ResumeState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(resumeKeyFor(file));
    return raw ? (JSON.parse(raw) as ResumeState) : null;
  } catch {
    return null;
  }
}

function saveResumeState(file: File, state: ResumeState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(resumeKeyFor(file), JSON.stringify(state));
  } catch {
    /* best-effort */
  }
}

function clearResumeState(file: File): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(resumeKeyFor(file));
  } catch {
    /* best-effort */
  }
}

/**
 * Dựng lại mảng mô tả các part (part_number, chunk_size) cho một file đã biết
 * size + chunkSize + partsExpected — khớp đúng logic backend `multipart_init`.
 * `url` để trống vì đường upload proxy (BFF) không cần presigned URL.
 */
function buildPartsArray(
  size: number,
  chunkSize: number,
  partsExpected: number,
): { part_number: number; url: string; chunk_size: number }[] {
  const parts: { part_number: number; url: string; chunk_size: number }[] = [];
  for (let n = 1; n <= partsExpected; n++) {
    const actual =
      n === partsExpected ? size - (partsExpected - 1) * chunkSize : chunkSize;
    parts.push({ part_number: n, url: "", chunk_size: actual });
  }
  return parts;
}

/**
 * Kiểm tra trạng thái session trên server — dùng để resume sau khi rớt mạng.
 * Trả về null nếu session không còn tồn tại / lỗi (khi đó client sẽ init mới).
 */
async function callStatus(uploadId: string): Promise<StatusResponse | null> {
  const token = await apiGetToken();
  try {
    const res = await fetch(
      `/api/documents/multipart/status?upload_id=${encodeURIComponent(uploadId)}`,
      {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as StatusResponse;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PUT 1 chunk lên presigned URL — có retry
// ---------------------------------------------------------------------------

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Nếu trình duyệt báo offline (navigator.onLine === false — rớt mạng/DNS),
 * chờ cho tới khi trực tuyến trở lại hoặc hết budget (mặc định 5 phút).
 * Khi online thì trả về ngay. Không ném lỗi — để vòng retry tự quyết định.
 */
async function waitForOnline(
  signal: AbortSignal,
  maxWaitMs = 5 * 60 * 1000,
): Promise<void> {
  if (typeof navigator === "undefined" || navigator.onLine) return;
  const start = Date.now();
  await new Promise<void>((resolve) => {
    const check = () => {
      if (signal.aborted || navigator.onLine || Date.now() - start > maxWaitMs) {
        window.removeEventListener("online", check);
        clearInterval(poll);
        resolve();
      }
    };
    const poll = setInterval(check, 1000);
    window.addEventListener("online", check);
    signal.addEventListener("abort", check, { once: true });
  });
}

async function putChunk(
  url: string,
  body: Blob,
  partNumber: number,
  signal: AbortSignal,
  uploadId?: string,
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (signal.aborted) {
      throw new DOMException("Upload aborted", "AbortError");
    }
    try {
      // Ưu tiên upload qua backend proxy (BFF) nếu có uploadId.
      // Proxy URL: /api/documents/multipart/{uploadId}/part/{partNumber}
      // Fallback: direct PUT lên MinIO presigned URL (khi MinIO có public IP).
      const proxyUrl = uploadId
        ? `/api/documents/multipart/${uploadId}/part/${partNumber}`
        : url;
      const useProxy = !!uploadId;

      const headers: Record<string, string> = {};
      if (useProxy) {
        // Proxy (BFF → FastAPI) yêu cầu JWT; presigned MinIO URL thì không cần.
        const token = await apiGetToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(proxyUrl, {
        method: "PUT",
        body,
        signal,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      });
      if (!res.ok) {
        throw new Error(
          `PUT part ${partNumber} failed: ${res.status} ${res.statusText}`,
        );
      }

      if (useProxy) {
        // Proxy returns JSON { part_number, etag }
        const data = await res.json();
        const etag = data?.etag ?? "";
        if (!etag) {
          throw new Error(`No ETag in proxy response for part ${partNumber}`);
        }
        return etag;
      }

      // Direct MinIO: ETag trong header
      const etag = res.headers.get("ETag") ?? res.headers.get("etag") ?? "";
      const cleanEtag = etag.replace(/"/g, "");
      if (!cleanEtag) {
        throw new Error(`No ETag in response for part ${partNumber}`);
      }
      return cleanEtag;
    } catch (err) {
      if ((err as any)?.name === "AbortError") throw err;
      lastError = err;
      if (attempt < MAX_RETRIES) {
        // Backoff luỹ thừa (1s, 2s, 4s, 8s, 16s, 30s...) chặn ở MAX_BACKOFF_MS.
        // Nếu trình duyệt báo đang offline (rớt mạng/DNS), chờ cho tới khi
        // trực tuyến trở lại (hoặc hết budget chờ) rồi mới retry — tránh đốt
        // hết số lần thử trong vài giây khi mạng chưa hồi.
        await waitForOnline(signal);
        const delay = Math.min(
          MAX_BACKOFF_MS,
          1000 * Math.pow(2, attempt - 1),
        );
        await sleep(delay, signal);
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
   *
   * Nếu có session cũ cho đúng file này (lưu ở localStorage) và server xác
   * nhận vẫn `pending`, sẽ resume: bỏ qua các part đã có trên MinIO, chỉ upload
   * phần còn thiếu. Nếu không resume được (session hết hạn/mất), init mới.
   */
  async start(): Promise<ChunkedUploadResult> {
    const { file, options } = this;
    const signal = options.signal ?? new AbortController().signal;

    // 1. Thử resume session cũ trước khi init mới.
    const resumed = await this.tryResume(file, signal);
    if (!resumed) {
      const init = await callInit(
        file.name,
        file.size,
        file.type || "application/octet-stream",
        "student_project",
      );
      this.uploadId = init.upload_id;
      this.parts = init.parts;
      saveResumeState(file, {
        uploadId: init.upload_id,
        chunkSize: init.chunk_size,
        partsExpected: init.parts_expected,
      });
      options.onProgress(0, file.size);
    }

    // 2. Upload từng chunk còn thiếu (parallel với concurrency)
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
    // Thành công → xoá khoá resume để lần sau upload lại từ đầu.
    clearResumeState(file);
    options.onProgress(file.size, file.size);
    return result;
  }

  /**
   * Nếu tồn tại session cũ cho file này và server vẫn `pending`, nạp các part
   * đã upload (ETag từ MinIO) và dựng lại mảng parts → trả về true (đã resume).
   * Trả về false nếu cần init mới.
   */
  private async tryResume(file: File, _signal: AbortSignal): Promise<boolean> {
    const saved = loadResumeState(file);
    if (!saved?.uploadId) return false;

    const status = await callStatus(saved.uploadId);
    if (!status || status.status !== "pending") {
      clearResumeState(file);
      return false;
    }
    // Session phải khớp đúng kích thước file + số part đã lưu.
    if (
      status.parts_expected !== saved.partsExpected ||
      saved.chunkSize <= 0
    ) {
      clearResumeState(file);
      return false;
    }

    this.uploadId = saved.uploadId;
    this.parts = buildPartsArray(
      file.size,
      saved.chunkSize,
      saved.partsExpected,
    );

    // Nạp ETag của các part đã có trên MinIO → đánh dấu đã upload.
    let recoveredBytes = 0;
    for (const p of status.uploaded_parts) {
      const part = this.parts.find((x) => x.part_number === p.PartNumber);
      if (!part) continue;
      this.etags.set(p.PartNumber, (p.ETag || "").replace(/"/g, ""));
      recoveredBytes += part.chunk_size;
    }
    this.bytesUploaded = recoveredBytes;
    this.options.onProgress(recoveredBytes, file.size);
    return true;
  }

  /**
   * Hủy upload + giải phóng parts trên MinIO.
   * An toàn để gọi nhiều lần.
   */
  async abort(): Promise<void> {
    if (this.uploadId) {
      await callAbort(this.uploadId);
      clearResumeState(this.file);
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

        // Part đã có ETag (từ lần upload trước / resume) → bỏ qua, không gửi lại.
        if (this.etags.has(part.part_number)) continue;

        const start = (part.part_number - 1) * part.chunk_size;
        const end = Math.min(start + part.chunk_size, this.file.size);
        const blob = this.file.slice(start, end);

        const etag = await putChunk(part.url, blob, part.part_number, signal, this.uploadId);
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
