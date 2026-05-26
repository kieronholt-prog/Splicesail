/** PostgREST embed `boat_class_pn(py)` on `boat_classes` rows. */
export function boatPyFromEmbeddedPnRelation(
  rel: { py?: number | null } | null | undefined,
): number | null {
  if (!rel || typeof rel !== "object") return null;
  const py = rel.py;
  if (py == null || !Number.isFinite(Number(py))) return null;
  return Math.trunc(Number(py));
}
