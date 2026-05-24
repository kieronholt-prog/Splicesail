import type { MarkOverride, SailingCourseRow, SailingMarkRow } from "./types";

export type ResolvedMarkPosition = {
  name: string;
  lat: number;
  lon: number;
  fixed: boolean;
  roundTack?: "P" | "S";
};

export function buildMarkPositionsFromClubData(
  marks: SailingMarkRow[],
  course: SailingCourseRow | null,
  markOverrides: Record<string, MarkOverride> = {},
): { markPositions: ResolvedMarkPosition[]; preamble: ResolvedMarkPosition[] } {
  const byName = new Map(marks.map((m) => [m.name, m]));

  function resolveRow(row: [string, "P" | "S"]): ResolvedMarkPosition | null {
    const [name, tack] = row;
    const base = byName.get(name);
    if (!base) return null;
    const ovr = markOverrides[name];
    return {
      name,
      lat: ovr?.lat ?? base.lat,
      lon: ovr?.lon ?? base.lon,
      fixed: base.mark_kind === "fixed",
      roundTack: tack,
    };
  }

  const preamble = (course?.marks_preamble ?? [])
    .map(resolveRow)
    .filter((x): x is ResolvedMarkPosition => x != null);

  const markPositions = (course?.mark_sequence ?? [])
    .map(resolveRow)
    .filter((x): x is ResolvedMarkPosition => x != null);

  return { markPositions, preamble };
}

export function startFinishLineFromSetup(
  courseSetup: Record<string, unknown>,
  defaultEnds: { endA: { lat: number; lon: number }; endB: { lat: number; lon: number } },
) {
  const a = courseSetup.sfLineEndA as { lat?: number; lon?: number } | undefined;
  const b = courseSetup.sfLineEndB as { lat?: number; lon?: number } | undefined;
  if (a?.lat != null && a?.lon != null && b?.lat != null && b?.lon != null) {
    return { endA: { lat: a.lat, lon: a.lon }, endB: { lat: b.lat, lon: b.lon } };
  }
  return defaultEnds;
}
