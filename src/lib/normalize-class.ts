/** Normalizes a boat class label to match `boat_classes.class_key` rows. */
export function normalizeBoatClassKey(className: string | null): string | null {
  if (!className || typeof className !== "string") return null;
  const t = className.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t.length) return null;
  return t
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
