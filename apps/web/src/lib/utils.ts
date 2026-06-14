/**
 * Merge class names utility (lightweight cn without clsx/tailwind-merge).
 */
export function cn(...inputs: Array<string | undefined | false | null>) {
  return inputs.filter(Boolean).join(" ");
}
