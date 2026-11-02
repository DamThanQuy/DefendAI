/**
 * Parse chuỗi timestamp trả về từ FastAPI.
 *
 * Backend lưu UTC naive (`datetime.utcnow()`, cột TIMESTAMP WITHOUT TIME ZONE)
 * và trả ra chuỗi ISO KHÔNG có suffix `Z`/offset. Nếu đưa thẳng vào
 * `new Date()`, JS sẽ diễn giải thành giờ LOCAL của browser → hiển thị lệch
 * đúng số giờ so với UTC (VN lệch 7 tiếng).
 *
 * Helper này gắn `Z` cho chuỗi naive (coi là UTC) rồi mới parse; chuỗi đã có
 * múi giờ (`Z`, `+07:00`...) thì giữ nguyên.
 */
export function parseApiDate(iso: string | null | undefined): Date {
  if (!iso) return new Date(NaN);
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso.trim());
  return new Date(hasTz ? iso.trim() : `${iso.trim()}Z`);
}
