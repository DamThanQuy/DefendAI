/**
 * Helper dùng chung cho các form auth (đăng nhập, đăng ký, quên mật khẩu).
 */

/**
 * Chuẩn hoá `detail` lỗi từ backend (FastAPI) về chuỗi.
 * Với lỗi 422 FastAPI trả detail là MẢNG object [{type, loc, msg, input, ctx}];
 * gắn thẳng object/mảng vào setError sẽ làm React crash khi render
 * ("Objects are not valid as a React child") → trắng cả trang.
 */
export function detailToMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) =>
        typeof d === "string" ? d : (d as { msg?: unknown } | null)?.msg
      )
      .filter((m): m is string => typeof m === "string" && m.length > 0);
    if (msgs.length > 0) return msgs.join(", ");
  } else if (
    detail !== null &&
    typeof detail === "object" &&
    typeof (detail as { msg?: unknown }).msg === "string"
  ) {
    return (detail as { msg: string }).msg;
  }
  return fallback;
}

export const PASSWORD_RULE_HINT =
  "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký hiệu đặc biệt.";

/** Trả về các điều kiện còn thiếu. Backend kiểm tra cùng quy tắc ở schemas/user.py. */
export function validatePassword(value: string): string[] {
  const missing: string[] = [];
  if (value.length < 8) missing.push("ít nhất 8 ký tự");
  if (!/[A-Z]/.test(value)) missing.push("một chữ hoa");
  if (!/[a-z]/.test(value)) missing.push("một chữ thường");
  if (!/[0-9]/.test(value)) missing.push("một chữ số");
  if (!/[^A-Za-z0-9]/.test(value)) missing.push("một ký hiệu đặc biệt");
  return missing;
}
