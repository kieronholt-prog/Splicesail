import { parseStartSequenceMinutes } from "./series-start-sequence";

export type StartSequenceMilestoneKind =
  | "class_hoist"
  | "prep_hoist"
  | "prep_lower"
  | "class_lower";

export type StartSequenceMilestone = {
  t: number;
  kind: StartSequenceMilestoneKind;
};

/** Absolute UTC ms for each signal relative to this fleet's start instant. */
export function startSequenceMilestonesUtcMs(
  targetMs: number,
  code: string | null | undefined,
): StartSequenceMilestone[] {
  const [w, p, d] = parseStartSequenceMinutes(code);
  return [
    { t: targetMs - w * 60_000, kind: "class_hoist" },
    { t: targetMs - p * 60_000, kind: "prep_hoist" },
    { t: targetMs - d * 60_000, kind: "prep_lower" },
    { t: targetMs, kind: "class_lower" },
  ];
}

export type FlagPole = "class" | "prep";

export type NextFlagChange = {
  atMs: number;
  pole: FlagPole;
  action: "hoist" | "lower";
  description: string;
};

export function nextClassFlagChange(
  targetMs: number,
  code: string | null | undefined,
  nowMs: number,
): NextFlagChange | null {
  const m = startSequenceMilestonesUtcMs(targetMs, code);
  const hoist = m.find((x) => x.kind === "class_hoist")!;
  const lower = m.find((x) => x.kind === "class_lower")!;
  if (nowMs < hoist.t) {
    return {
      atMs: hoist.t,
      pole: "class",
      action: "hoist",
      description: "Hoist class flag (warning)",
    };
  }
  if (nowMs < lower.t) {
    return {
      atMs: lower.t,
      pole: "class",
      action: "lower",
      description: "Lower class flag (start)",
    };
  }
  return null;
}

export function nextPrepFlagChange(
  targetMs: number,
  code: string | null | undefined,
  nowMs: number,
): NextFlagChange | null {
  const m = startSequenceMilestonesUtcMs(targetMs, code);
  const hi = m.find((x) => x.kind === "prep_hoist")!;
  const lo = m.find((x) => x.kind === "prep_lower")!;
  if (nowMs < hi.t) {
    return {
      atMs: hi.t,
      pole: "prep",
      action: "hoist",
      description: "Hoist preparatory (P)",
    };
  }
  if (nowMs < lo.t) {
    return {
      atMs: lo.t,
      pole: "prep",
      action: "lower",
      description: "Lower preparatory (P)",
    };
  }
  return null;
}

export function classFlagHoisted(
  targetMs: number,
  code: string | null | undefined,
  nowMs: number,
): boolean {
  const m = startSequenceMilestonesUtcMs(targetMs, code);
  const hoist = m.find((x) => x.kind === "class_hoist")!.t;
  const lower = m.find((x) => x.kind === "class_lower")!.t;
  return nowMs >= hoist && nowMs < lower;
}

/** Earliest sequence horn after `nowMs`, if any. */
export function nextStartSequenceMilestone(
  targetMs: number,
  code: string | null | undefined,
  nowMs: number,
): StartSequenceMilestone | null {
  const m = [...startSequenceMilestonesUtcMs(targetMs, code)].sort((a, b) => a.t - b.t);
  return m.find((ev) => ev.t > nowMs) ?? null;
}
