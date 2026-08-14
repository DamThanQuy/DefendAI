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

/** Max file size in bytes (10 GB). */
export const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024;

/** Question personas — key khớp với backend FastAPI (theory/strict/enterprise). */
export const PERSONAS = [
  {
    key: "theory",
    label: "Giảng viên hướng dẫn",
    description: "Hỏi bao quát, mang tính chất xây dựng và gợi mở.",
  },
  {
    key: "strict",
    label: "Hội đồng phản biện khó tính",
    description: "Soi xét kỹ các lỗ hổng, hỏi xoáy đáp xoay.",
  },
  {
    key: "enterprise",
    label: "Chuyên gia kỹ thuật sâu",
    description: "Đi sâu vào architecture, performance và code optimization.",
  },
] as const;

export type PersonaKey = (typeof PERSONAS)[number]["key"];

/** Map persona key → nhãn hiển thị (dùng cho badge, tooltip). */
export const PERSONA_LABELS: Record<string, string> = Object.fromEntries(
  PERSONAS.map((p) => [p.key, p.label]),
);
