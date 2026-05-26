/** Earliest first-start instant (race `scheduled_at` + fleet offset) in epoch ms. */

export function firstStartSignalEpochMs(
  scheduledAtIso: string,
  fleets: { start_offset_minutes: number | null }[],
): number | null {
  const base = new Date(scheduledAtIso).getTime();
  if (!Number.isFinite(base)) return null;
  if (!fleets.length) return base;
  let minT = Number.POSITIVE_INFINITY;
  for (const f of fleets) {
    const off =
      f.start_offset_minutes != null && Number.isFinite(Number(f.start_offset_minutes))
        ? Number(f.start_offset_minutes)
        : 0;
    const t = base + off * 60_000;
    if (t < minT) minT = t;
  }
  return Number.isFinite(minT) ? minT : base;
}
