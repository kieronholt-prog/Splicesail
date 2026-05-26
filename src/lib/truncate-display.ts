/**
 * If `text` exceeds `maxChars`, show the first `maxChars - 1` characters plus a
 * single ellipsis (…), so only one “slot” at the end is the omission marker —
 * not a multi-character `...` tail from CSS `text-overflow`.
 */
export function truncateToLastCharEllipsis(text: string, maxChars: number): string {
  if (maxChars < 1) return "\u2026";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "\u2026";
}
