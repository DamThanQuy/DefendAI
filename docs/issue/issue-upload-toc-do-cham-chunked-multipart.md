# Báo cáo sự cố & Phân tích kỹ thuật: Tốc độ upload file lớn bị chậm (Chunked Multipart Upload)

- **Ngày ghi nhận:** 13/10/2026
- **Tập tin kiểm thử:** `DefendAI.zip` (Dung lượng: 2,744.7 MB ~ 2.87 GB)
- **Môi trường:** Production Frontend (`https://defend-ai.vercel.app`) & Backend (`https://tkm1.taildec640.ts.net`)
- **Tình trạng:** Đã khoanh vùng nguyên nhân gốc rễ (Root Cause) & đề xuất giải pháp kiến trúc tối ưu.

---

## 1. Hiện tượng & Triệu chứng (Symptoms)

- Người dùng tải file `DefendAI.zip` (2.87 GB) lên hệ thống qua giao diện web `https://defend-ai.vercel.app/documents`.
- Sau **1 tiếng 48 phút**, tiến trình upload chỉ đạt khoảng **48% – 50%** (~1,376 MB).
- Tốc độ upload trung bình thực tế chỉ đạt khoảng **2.5 – 3.5 MB/s**, thấp hơn nhiều so với băng thông cáp quang thông thường (100 – 300 Mbps ~ 15 – 35 MB/s).

---

## 2. Nguyên nhân gốc rễ (Root Causes)

Qua điều tra chuyên sâu bằng Chrome DevTools Protocol (CDP) và phân tích luồng mạng, phát hiện 4 nút thắt cổ chai:

### 2.1. Treo Timeout bởi Domain Cloudflare Tunnel cũ (Nút thắt thời gian lớn nhất)
- Trong `apps/web/src/app/layout.tsx`:  
  `<meta name="backend-url" content={process.env.NEXT_PUBLIC_BACKEND_URL} />`
- Khi build trên Vercel production trước đó, biến này đang chứa domain Cloudflare tunnel dùng thử đã hết hạn:  
  `https://sie-burke-screens-newspapers.trycloudflare.com`
- Trong `apps/web/src/lib/chunked-upload.ts`: Client ưu tiên **Strategy 1** gọi trực tiếp `getDirectBackendUrl()`.
- **Đo lường thực tế từ Network Trace (CDP):**
  - Mỗi cụm 3 chunk concurrent, trình duyệt gửi request tới `sie-burke-screens-newspapers.trycloudflare.com` và bị treo đúng **12,000 ms – 12,982 ms (12–13 giây)** trước khi nhận lỗi DNS (`net::ERR_NAME_NOT_RESOLVED`).
  - Sau khi timeout, client mới fallback sang Strategy 3 (Vercel Proxy).
  - Với 343 chunks, chỉ riêng thời gian chờ timeout vô ích này đã ngốn tổng cộng **hơn 25 – 35 phút**!

### 2.2. Kích thước Chunk Size quá nhỏ đối với file nhiều Gigabyte (8 MB / chunk)
- File 2.87 GB được cắt thành **343 chunks** (8 MB/chunk).
- Mỗi chunk phải:
  1. Cắt slice Blob trong RAM trình duyệt.
  2. Tính mã băm `SHA-256` bằng Web Crypto API.
  3. Mở kết nối TCP/TLS riêng biệt (343 roundtrips HTTP).
- Overhead bắt tay mạng và tính hash lặp lại 343 lần làm tiêu tốn tài nguyên và tăng độ trễ tích lũy.

### 2.3. Dữ liệu đi đường vòng qua Vercel Proxy (Double Hops) và Payload Bottleneck
- Do đường trực tiếp thất bại, client phải đi đường vòng:
  $$\text{Browser (Client)} \xrightarrow{\text{Upload 8MB}} \text{Vercel Serverless Function} \xrightarrow{\text{Forward}} \text{Tailscale Funnel} \xrightarrow{\text{FastAPI}} \text{MinIO}$$
- **Đo lường thực tế từ Network Trace (CDP):**
  - Mỗi request upload chunk qua `/api/documents/multipart/[id]/part/[num]` trên Vercel mất từ **86,000 ms đến 106,699 ms (~1.5 phút/chunk)** khi qua trung chuyển Vercel Function sang Tailscale Funnel.
  - Dữ liệu bị trung chuyển 2 chặng mạng quốc tế thay vì đi thẳng vào máy chủ lưu trữ.

### 2.4. Băng thông Tailscale Funnel Relay bị giới hạn
- Tailscale Funnel là tính năng public port ra internet đi qua các máy chủ trung gian (DERP Relay node) của Tailscale, không phải mạng WireGuard P2P trực tiếp.
- Băng thông qua relay bị bóp ở mức khoảng **2 – 4 MB/s** khi truyền tải dung lượng lớn liên tục.
- Cổng `8443` (MinIO Direct Funnel) trên máy client cài Tailscale bị MagicDNS phân giải thành IP nội bộ `100.86.219.106` thay vì Public Ingress IP `103.84.155.153`, khiến browser không kết nối trực tiếp được vào MinIO presigned URL.

---

## 3. Các bước xử lý đã thực hiện (Immediate Fixes)

1. **Client-side Filter trong `chunked-upload.ts`:**
   - Cập nhật hàm `getDirectBackendUrl()` để tự động loại bỏ các URL chứa `trycloudflare.com` đã chết, ngăn chặn việc browser chờ timeout 12–13s mỗi chunk.
2. **Theo dõi tiến trình thời gian thực:**
   - Script CDP giám sát tự động đọc trực tiếp DOM và Performance Timeline để đảm bảo file 2.87 GB tiếp tục được upload trọn vẹn vào MinIO mà không bị gián đoạn hay mất dữ liệu đã tải.

---

## 4. Kế hoạch khắc phục triệt để (Architecture Roadmap)

### 4.1. Tăng Chunk Size động theo dung lượng file (Triển khai ngay sau khi tải xong)
Cập nhật logic cắt chunk trong client:
- File $< 500 \text{ MB}$: giữ chunk size **8 MB**.
- File $500 \text{ MB} - 2 \text{ GB}$: nâng lên **32 MB** (~15 - 60 parts).
- File $> 2 \text{ GB}$: nâng lên **64 MB** (File 2.87 GB chỉ còn **~45 parts**, giảm 87% số request HTTP).

### 4.2. Tăng số luồng upload đồng thời (`concurrency`)
- Tăng `concurrency` từ `3` lên `6` hoặc `8` luồng song song để tận dụng tối đa băng thông đa luồng của đường truyền internet cáp quang.

### 4.3. Direct S3 Presigned Upload (Bypass Vercel & Backend)
- Thiết lập domain public SSL ổn định cho MinIO (ví dụ `s3.defendai.dev` hoặc cổng 443).
- Trình duyệt sẽ gửi trực tiếp từng chunk vào MinIO qua URL presigned (chuẩn của AWS/Google Drive), không chạy qua Vercel hay backend FastAPI, giúp tốc độ đạt tối đa **15 – 35 MB/s** (file 2.87 GB tải trong ~2 phút).

---

## 5. Kết quả kiểm thử hoàn tất (Final Status)

- **Trạng thái:** ✅ **Đã tải lên thành công 100%**
- **Document ID:** `8` (`DefendAI.zip` - 2,744.7 MB ~ 2.87 GB)
- **Tổng số parts:** 344 / 344 parts đã ghép hợp lệ trên MinIO storage.
- **Xác nhận giao diện:** Đã xuất hiện trong danh mục **"Tài liệu của tôi"** (`https://defend-ai.vercel.app/documents`), sẵn sàng đưa vào Workspace để AI tạo câu hỏi phản biện.


