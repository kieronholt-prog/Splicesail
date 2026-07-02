import { courseDirFromPoint, isUpwindHemisphere } from "./geo-heading";
import {
  iterUpwindLegTackSegments,
  resolveUpwindSegmentTackSide,
  type AnalysisLeg,
  type AnalysisPoint,
  type AnalysisTack,
} from "./fleet-wind-grid";

export type UpwindTackPointKind = "upwind_port" | "upwind_stbd";

const UPWIND_PORT_COLOR = "#ff4a6a";
const UPWIND_STBD_COLOR = "#4aff8a";

export { UPWIND_PORT_COLOR, UPWIND_STBD_COLOR };

/** Per GPS index: upwind tack side on upwind legs, else null. */
export function buildUpwindBetweenTackPointKinds(
  points: AnalysisPoint[],
  tacks: AnalysisTack[],
  legs: AnalysisLeg[],
  windFromDeg: number,
): (UpwindTackPointKind | null)[] {
  const n = points.length;
  const out = new Array<UpwindTackPointKind | null>(n).fill(null);
  if (n < 3 || !Number.isFinite(windFromDeg)) return out;

  const segments = iterUpwindLegTackSegments(points, tacks, legs, { includeExcludedTacks: true });
  if (segments.length === 0) return out;

  for (const { from, to, exitTack, entryTack } of segments) {
    const lo = Math.max(0, from + 1);
    const hi = Math.min(n - 1, to - 1);
    if (hi - lo < 2) continue;

    const midIdx = Math.floor((lo + hi) / 2);
    const midCog = courseDirFromPoint(points[midIdx] ?? {});
    const segmentSide = resolveUpwindSegmentTackSide(exitTack, entryTack, midCog, windFromDeg);
    const kind: UpwindTackPointKind = segmentSide === "P" ? "upwind_port" : "upwind_stbd";

    for (let i = lo; i <= hi; i++) {
      const p = points[i];
      if (!p) continue;
      const cog = courseDirFromPoint(p);
      if (!isUpwindHemisphere(cog, windFromDeg)) continue;
      out[i] = kind;
    }
  }

  return out;
}

/** GeoJSON LineString segments coloured by upwind tack side (port / starboard). */
export function buildUpwindBetweenTackTrackSegmentFC(
  points: AnalysisPoint[],
  tacks: AnalysisTack[],
  legs: AnalysisLeg[],
  windFromDeg: number,
): GeoJSON.FeatureCollection {
  if (!points || points.length < 2) {
    return { type: "FeatureCollection", features: [] };
  }

  const kinds = buildUpwindBetweenTackPointKinds(points, tacks, legs, windFromDeg);
  const feats: GeoJSON.Feature[] = [];
  let segStart = 0;
  let kind = kinds[0];

  const pushSeg = (a: number, b: number, k: UpwindTackPointKind) => {
    if (b < a) return;
    const coords: [number, number][] = [];
    for (let j = a; j <= b; j++) {
      const p = points[j];
      if (!p || p.lat == null || p.lon == null) continue;
      coords.push([p.lon, p.lat]);
    }
    if (coords.length === 1) coords.push(coords[0]!);
    if (coords.length >= 2) {
      feats.push({
        type: "Feature",
        properties: { kind: k },
        geometry: { type: "LineString", coordinates: coords },
      });
    }
  };

  for (let i = 1; i < points.length; i++) {
    const rk = kinds[i];
    if (rk !== kind) {
      if (kind === "upwind_port" || kind === "upwind_stbd") {
        pushSeg(segStart, i - 1, kind);
      }
      segStart = i - 1;
      kind = rk;
    }
  }
  if (kind === "upwind_port" || kind === "upwind_stbd") {
    pushSeg(segStart, points.length - 1, kind);
  }

  return { type: "FeatureCollection", features: feats };
}

/** Mapbox `line-color` for upwind tack overlay layer. */
export function mapboxUpwindTackLineColorExpr(): unknown[] {
  return [
    "match",
    ["get", "kind"],
    "upwind_port",
    UPWIND_PORT_COLOR,
    "upwind_stbd",
    UPWIND_STBD_COLOR,
    UPWIND_PORT_COLOR,
  ];
}
