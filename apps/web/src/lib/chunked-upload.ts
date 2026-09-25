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
  /** true nếu session được tạo bởi client có gửi SHA-256 per part.
   *  Chỉ resume các session này — part cũ (không verify được nội dung) sẽ
   *  bị loại, tránh mang theo part hỏng đúng-độ-dài-sai-byte vào file ghép. */
  checksummed?: boolean;
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
 * Tính SHA-256 (hex) của một Blob bằng Web Crypto. Backend dùng để phát hiện
 * part bị hỏng NỘI DUNG (đúng độ dài nhưng sai byte) khi truyền qua proxy.
 */
async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

/**
 * Kiểm tra xem presigned URL có phải là public endpoint (MinIO funnel) hay không.
 * Nếu có → browser có thể PUT trực tiếp, bypass Vercel BFF proxy → nhanh hơn.
 * Chỉ áp dụng cho HTTPS URL từ taildec640.ts.net (Tailscale funnel).
 */
function isPublicMinioUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.includes("taildec640.ts.net");
  } catch {
    return false;
  }
}

/**
 * Lấy backend URL trực tiếp (ngrok tunnel) để upload chunks bypass BFF.
 * Trả về null nếu BACKEND_URL không được expose qua env (dev mode).
 */
function getDirectBackendUrl(): string | null {
  // Next.js public env: NEXT_PUBLIC_BACKEND_URL cho client-side access
  // Fallback: không có → dùng BFF proxy (dev mode)
  if (typeof window === "undefined") return null;
  // Đọc từ meta tag hoặc env variable
  const meta = document.querySelector('meta[name="backend-url"]');
  if (meta) return meta.getAttribute("content");
  return null;
}

/**
 * PUT trực tiếp lên MinIO presigned URL (không qua proxy).
 * QUAN TRỌNG: KHÔNG gửi Content-Type — MinIO SigV2 presign không bao gồm
 * Content-Type, nếu browser tự thêm sẽ bị 403 SignatureDoesNotMatch.
 * Cũng không gửi Authorization hay X-Part-Sha256 (chỉ cần cho proxy path).
 */
async function putDirectMinio(
  url: string,
  body: Blob,
  partNumber: number,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(url, {
    method: "PUT",
    body,
    signal,
    // KHÔNG set headers — browser sẽ không thêm Content-Type nếu ta không
    // chỉ định, và MinIO SigV2 sẽ match signature.
  });
  if (!res.ok) {
    throw new Error(
      `Direct PUT part ${partNumber} failed: ${res.status} ${res.statusText}`,
    );
  }
  const etag = res.headers.get("ETag") ?? res.headers.get("etag") ?? "";
  const cleanEtag = etag.replace(/"/g, "");
  if (!cleanEtag) {
    throw new Error(`No ETag in direct response for part ${partNumber}`);
  }
  return cleanEtag;
}

/**
 * PUT chunk trực tiếp đến FastAPI backend (qua ngrok tunnel), bypass Vercel BFF.
 * Nhanh hơn proxy path vì không bị Vercel function timeout (10s) và không phải
 * transfer bytes qua 2 hops (browser → Vercel → FastAPI → MinIO).
 */
async function putChunkViaBackend(
  backendUrl: string,
  uploadId: string,
  body: Blob,
  partNumber: number,
  signal: AbortSignal,
): Promise<string> {
  const token = await apiGetToken();
  const sha = await sha256Hex(body);
  const url = `${backendUrl}/api/documents/multipart/${uploadId}/part/${partNumber}`;

  const headers: Record<string, string> = {
    "X-Part-Sha256": sha,
    "ngrok-skip-browser-warning": "true",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "PUT",
    body,
    signal,
    headers,
  });
  if (!res.ok) {
    throw new Error(
      `Backend PUT part ${partNumber} failed: ${res.status} ${res.statusText}`,
    );
  }
  const data = await res.json();
  const etag = data?.etag ?? "";
  if (!etag) {
    throw new Error(`No ETag in backend response for part ${partNumber}`);
  }
  return etag;
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
      // ── Strategy 1: Direct backend (ngrok tunnel) ──
      // Bypass Vercel BFF proxy — upload chunks trực tiếp đến FastAPI qua
      // ngrok tunnel. Nhanh hơn nhiều vì không bị Vercel function timeout.
      if (uploadId) {
        const backendUrl = getDirectBackendUrl();
        if (backendUrl) {
          try {
            return await putChunkViaBackend(
              backendUrl, uploadId, body, partNumber, signal,
            );
          } catch (backendErr) {
            console.warn(
              `Direct backend PUT part ${partNumber} failed, falling back to proxy:`,
              backendErr,
            );
          }
        }
      }

      // ── Strategy 2: Direct MinIO (public presigned URL) ──
      const canTryDirect = uploadId && isPublicMinioUrl(url);

      if (canTryDirect) {
        try {
          return await putDirectMinio(url, body, partNumber, signal);
        } catch (directErr) {
          console.warn(
            `Direct PUT part ${partNumber} failed, falling back to proxy:`,
            directErr,
          );
        }
      }

      // ── Strategy 3: Proxy path (BFF → FastAPI → MinIO) ──
      const proxyUrl = uploadId
        ? `/api/documents/multipart/${uploadId}/part/${partNumber}`
        : url;

      const headers: Record<string, string> = {};
      if (uploadId) {
        // Proxy (BFF → FastAPI) yêu cầu JWT; presigned MinIO URL thì không cần.
        const token = await apiGetToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
        // Tính SHA-256 của chunk NGAY TRONG vòng retry và gửi kèm để backend
        // verify nội dung (chống part đúng độ dài nhưng sai byte khi truyền qua
        // proxy). Backend BẮT BUỘC header này → nếu crypto hiccup thì exception
        // ở đây sẽ được retry (không bao giờ gửi part không verify được).
        headers["X-Part-Sha256"] = await sha256Hex(body);
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

      if (uploadId) {
        // Proxy returns JSON { part_number, etag }
        const data = await res.json();
        const etag = data?.etag ?? "";
        if (!etag) {
          throw new Error(`No ETag in proxy response for part ${partNumber}`);
        }
        return etag;
      }

      // Direct MinIO (non-public): ETag trong header
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
  // Kích thước chunk CHUẨN (mọi part trừ part cuối). Part cuối có chunk_size =
  // phần dư, nên KHÔNG được dùng nó làm stride khi tính offset — nếu không part
  // cuối sẽ đọc sai vùng byte (đúng độ dài nhưng sai nội dung → EOCD missing).
  private chunkSize = DEFAULT_CHUNK_SIZE;

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
      this.chunkSize = init.chunk_size;
      saveResumeState(file, {
        uploadId: init.upload_id,
        chunkSize: init.chunk_size,
        partsExpected: init.parts_expected,
        checksummed: true,
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

    // Không resume session cũ do client CHƯA gửi checksum tạo ra: các part
    // đó không xác minh được nội dung → có thể hỏng đúng-độ-dài-sai-byte.
    // Bỏ qua (init mới) để mọi part đều được verify SHA-256.
    if (!saved.checksummed) {
      clearResumeState(file);
      return false;
    }

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
    this.chunkSize = saved.chunkSize;
    this.parts = buildPartsArray(
      file.size,
      saved.chunkSize,
      saved.partsExpected,
    );

    // Nạp ETag của các part đã có trên MinIO → đánh dấu đã upload.
    // CHỈ chấp nhận part có Size khớp đúng kích thước dự kiến — nếu part bị
    // cụt/thừa bytes (rớt mạng giữa PUT trước khi backend check độ dài có hiệu
    // lực), coi như chưa upload để gửi lại, tránh resume mang theo part hỏng.
    let recoveredBytes = 0;
    for (const p of status.uploaded_parts) {
      const part = this.parts.find((x) => x.part_number === p.PartNumber);
      if (!part) continue;
      if (typeof p.Size === "number" && p.Size !== part.chunk_size) continue;
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

        // Stride by the STANDARD chunk size (this.chunkSize), NOT part.chunk_size
        // (which is the remainder for the last part). Otherwise the last part
        // reads from the wrong byte region — correct length, wrong content.
        const start = (part.part_number - 1) * this.chunkSize;
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
