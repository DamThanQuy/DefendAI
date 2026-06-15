/** API base URL — thay bằng env var khi deploy. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Supported document file extensions. */
export const ACCEPTED_DOC_EXTENSIONS = [".pdf", ".docx", ".pptx"] as const;

/** Supported source code archive extensions. */
export const ACCEPTED_CODE_EXTENSIONS = [".zip"] as const;

/** All accepted file extensions. */
export const ACCEPTED_EXTENSIONS = [
  ...ACCEPTED_DOC_EXTENSIONS,
  ...ACCEPTED_CODE_EXTENSIONS,
] as const;

/** File input accept attribute. */
export const FILE_INPUT_ACCEPT = ACCEPTED_EXTENSIONS.join(",");

/** Max file size in bytes (100 MB). */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/** Question personas. */
export const PERSONAS = [
  { key: "ly_thuyet", label: "Lý thuyết", description: "Giảng viên hàn lâm" },
  { key: "thuc_te", label: "Thực tế", description: "Chuyên gia doanh nghiệp" },
  { key: "khat_khe", label: "Khắt khe", description: "Hội đồng khó tính" },
] as const;

export type PersonaKey = (typeof PERSONAS)[number]["key"];
