/** Course direction for analysis: compass heading when present, else GPS COG. */
export function courseDirFromPoint(p: {
  dir?: number;
  hdg?: number;
  heading?: number;
  cog?: number;
}): number {
  if (p.dir != null && Number.isFinite(p.dir)) return p.dir;
  const h = p.hdg ?? p.heading;
  if (h != null && Number.isFinite(Number(h))) return Number(h);
  return Number(p.cog ?? 0);
}

export function attachCourseDir<
  T extends { hdg?: number; heading?: number; cog?: number; dir?: number },
>(pts: T[]): T[] {
  for (const p of pts) {
    const h = p.hdg ?? p.heading;
    p.dir = h != null && Number.isFinite(Number(h)) ? Number(h) : Number(p.cog ?? 0);
  }
  return pts;
}

/** Signed angle from wind FROM to heading (−180…+180, + = clockwise). */
export function signedAngleFromWind(headingDeg: number, windFromDeg: number): number {
  let rel = (headingDeg - windFromDeg + 360) % 360;
  if (rel > 180) rel -= 360;
  return rel;
}

/** True when heading is on the upwind side of the wind axis (|TWA| < 90°). */
export function isUpwindHemisphere(headingDeg: number, windFromDeg: number): boolean {
  return Math.abs(signedAngleFromWind(headingDeg, windFromDeg)) < 90;
}
