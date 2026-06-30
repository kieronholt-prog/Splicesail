import {
  courseDirFromPoint,
  isUpwindHemisphere,
  signedAngleFromWind,
} from "./geo-heading";

export type WindCrossingKind = "tack" | "gybe" | "none";

export type WindCrossingClassification = {
  kind: WindCrossingKind;
  turnIdx: number;
  crossing: string;
  sideBef: "P" | "S" | null;
  sideAft: "P" | "S" | null;
  tackCrossIdx: number | null;
  gybeCrossIdx: number | null;
};

type ManoeuvreSlice = {
  idx?: number;
  turnIdx?: number;
  preSegment?: { endIdx: number };
  postSegment?: { startIdx: number };
  preRefCOG?: number;
  preCOG?: number;
  postCOG?: number;
  _early?: boolean;
};

type DirPoint = { dir?: number; hdg?: number; heading?: number; cog?: number };

/** Relative bearing to wind FROM in [0, 360). */
export function relativeToWindFrom(headingDeg: number, windFromDeg: number): number {
  return ((headingDeg - windFromDeg) % 360 + 360) % 360;
}

/** Port / starboard tack side from relative bearing (upwind convention). */
export function tackSideFromRelative(rel: number): "P" | "S" {
  return rel > 180 ? "S" : "P";
}

/** Head-to-wind crossing: signed relative angle changes sign (through 0°). */
export function crossedHeadToWind(
  prevHeadingDeg: number,
  currHeadingDeg: number,
  windFromDeg: number,
): boolean {
  const prev = signedAngleFromWind(prevHeadingDeg, windFromDeg);
  const curr = signedAngleFromWind(currHeadingDeg, windFromDeg);
  if (Math.abs(prev) <= 3 || Math.abs(curr) <= 3) return true;
  return (prev > 0) !== (curr > 0);
}

/**
 * Dead-downwind crossing: relative angle passes through 180° (not a head-to-wind cross).
 * Both samples must be on the downwind half (acute angle > 90°).
 */
export function crossedDeadDownwind(
  prevHeadingDeg: number,
  currHeadingDeg: number,
  windFromDeg: number,
): boolean {
  const prev = relativeToWindFrom(prevHeadingDeg, windFromDeg);
  const curr = relativeToWindFrom(currHeadingDeg, windFromDeg);
  if ((prev > 180) === (curr > 180)) return false;
  const prevAcute = Math.min(prev, 360 - prev);
  const currAcute = Math.min(curr, 360 - curr);
  return prevAcute >= 90 && currAcute >= 90;
}

export function findWindAxisCrossingIndices(
  dirAtIndex: (idx: number) => number,
  startIdx: number,
  endIdx: number,
  windFromDeg: number,
): { tackCrossIdx: number | null; gybeCrossIdx: number | null } {
  let tackCrossIdx: number | null = null;
  let gybeCrossIdx: number | null = null;
  const s = Math.max(0, startIdx);
  const e = Math.min(endIdx, Number.MAX_SAFE_INTEGER);
  for (let i = s + 1; i <= e; i++) {
    const prevH = dirAtIndex(i - 1);
    const currH = dirAtIndex(i);
    if (!Number.isFinite(prevH) || !Number.isFinite(currH)) continue;
    if (tackCrossIdx == null && crossedHeadToWind(prevH, currH, windFromDeg)) {
      tackCrossIdx = i;
    }
    if (gybeCrossIdx == null && crossedDeadDownwind(prevH, currH, windFromDeg)) {
      gybeCrossIdx = i;
    }
  }
  return { tackCrossIdx, gybeCrossIdx };
}

function minDistanceToHeadToWind(headingDeg: number, windFromDeg: number): number {
  const rel = relativeToWindFrom(headingDeg, windFromDeg);
  return Math.min(rel, 360 - rel);
}

function minDistanceToDeadDownwind(headingDeg: number, windFromDeg: number): number {
  const rel = relativeToWindFrom(headingDeg, windFromDeg);
  return Math.abs(rel - 180);
}

function crossingLabel(sideBef: "P" | "S", sideAft: "P" | "S"): string {
  if (sideBef === "P" && sideAft === "S") return "P→S";
  if (sideBef === "S" && sideAft === "P") return "S→P";
  return "—";
}

/**
 * Classify a manoeuvre solely by whether course direction crosses head-to-wind (tack)
 * or dead-downwind (gybe) within the turn window.
 */
export function classifyManoeuvreByWindCrossing(
  pts: DirPoint[],
  m: ManoeuvreSlice,
  windFromDeg: number,
): WindCrossingClassification {
  const fallbackIdx = m.turnIdx ?? m.idx ?? 0;
  if (!pts?.length || !m?.preSegment || !m?.postSegment) {
    return {
      kind: "none",
      turnIdx: fallbackIdx,
      crossing: "—",
      sideBef: null,
      sideAft: null,
      tackCrossIdx: null,
      gybeCrossIdx: null,
    };
  }

  const relax = !!m._early;
  const padPre = relax ? 12 : 5;
  const padPost = relax ? 14 : 6;
  const s = Math.max(0, m.preSegment.endIdx - padPre);
  const e = Math.min(pts.length - 1, m.postSegment.startIdx + padPost);

  const dirAtIndex = (idx: number) => courseDirFromPoint(pts[idx]!);
  const { tackCrossIdx, gybeCrossIdx } = findWindAxisCrossingIndices(
    dirAtIndex,
    s,
    e,
    windFromDeg,
  );

  const preDir = m.preRefCOG ?? m.preCOG ?? dirAtIndex(s);
  const postDir = m.postCOG ?? dirAtIndex(e);
  const preRel = relativeToWindFrom(preDir, windFromDeg);
  const postRel = relativeToWindFrom(postDir, windFromDeg);
  const sideBef = tackSideFromRelative(preRel);
  const sideAft = tackSideFromRelative(postRel);
  const crossing = crossingLabel(sideBef, sideAft);

  const preUp = isUpwindHemisphere(preDir, windFromDeg);
  const postUp = isUpwindHemisphere(postDir, windFromDeg);
  const sidesFlip = sideBef !== sideAft;

  const tackValid =
    tackCrossIdx != null && preUp && postUp && sidesFlip;
  const gybeValid =
    gybeCrossIdx != null && !preUp && !postUp && sidesFlip;

  let kind: WindCrossingKind = "none";
  let turnIdx = fallbackIdx;

  if (tackValid && !gybeValid) {
    kind = "tack";
    turnIdx = tackCrossIdx;
  } else if (gybeValid && !tackValid) {
    kind = "gybe";
    turnIdx = gybeCrossIdx;
  } else if (tackValid && gybeValid) {
    const tackDist = minDistanceToHeadToWind(dirAtIndex(tackCrossIdx), windFromDeg);
    const gybeDist = minDistanceToDeadDownwind(dirAtIndex(gybeCrossIdx), windFromDeg);
    if (tackDist <= gybeDist) {
      kind = "tack";
      turnIdx = tackCrossIdx;
    } else {
      kind = "gybe";
      turnIdx = gybeCrossIdx;
    }
  }

  return {
    kind,
    turnIdx,
    crossing,
    sideBef,
    sideAft,
    tackCrossIdx,
    gybeCrossIdx,
  };
}
