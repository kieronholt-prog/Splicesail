/** Normal finish with a recorded time (stored as race_entries.outcome = finished). */
export const FINISH_STATUS_FIN = "fin" as const;

/** Penalty / non-finisher codes configured per series in Club admin → Scoring settings. */
export const SERIES_PENALTY_OUTCOMES: { code: string; label: string }[] = [
  { code: "dns", label: "DNS — Did not start" },
  { code: "dnf", label: "DNF — Did not finish" },
  { code: "dnc", label: "DNC — Did not compete" },
  { code: "retired", label: "RET — Retired" },
  { code: "dsq", label: "DSQ — Disqualified" },
];

/** OCS is start-line only — not offered when recording a finish. */
export const FINISH_NON_FINISHER_CODES = SERIES_PENALTY_OUTCOMES.map((o) => o.code);

/** Outcomes sailors may choose when tallying ashore (self-declaration). */
export const SAILOR_DECLARATION_OUTCOMES = ["finished", "retired", "dns", "dnc"] as const;

/** Finish outcomes recorded by race officer or club admin — not self-declaration. */
export const RO_ONLY_FINISH_OUTCOMES = ["ocs", "dnf", "dsq"] as const;

export function isRoOnlyFinishOutcome(code: string | null | undefined): boolean {
  const c = code?.trim().toLowerCase() ?? "";
  return (RO_ONLY_FINISH_OUTCOMES as readonly string[]).includes(c);
}

export function isSailorDeclarationOutcome(code: string): boolean {
  const c = code.trim().toLowerCase();
  return (SAILOR_DECLARATION_OUTCOMES as readonly string[]).includes(c);
}

const labelByCode = new Map<string, string>(
  SERIES_PENALTY_OUTCOMES.map((o) => [o.code, o.label]),
);

export function finishStatusSelectValue(outcome: string | null, hasFinishTime: boolean): string {
  if (hasFinishTime) return FINISH_STATUS_FIN;
  const o = outcome?.trim().toLowerCase() ?? "";
  if (o && o !== "finished" && FINISH_NON_FINISHER_CODES.includes(o)) return o;
  return FINISH_STATUS_FIN;
}

export function finishStatusDisplay(code: string | null | undefined): string {
  if (!code?.trim()) return "—";
  const c = code.trim().toLowerCase();
  if (c === FINISH_STATUS_FIN || c === "finished") return "FIN";
  return labelByCode.get(c) ?? c.toUpperCase();
}

export function penaltyOutcomeLabel(code: string): string {
  return labelByCode.get(code.trim().toLowerCase()) ?? code.toUpperCase();
}

export function roOnlyFinishOutcomeLabel(code: string): string {
  const c = code.trim().toLowerCase();
  if (c === "ocs") return "OCS (on-course side)";
  return penaltyOutcomeLabel(c);
}

/** Map UI / API finish status to race_entries.outcome (null clears). */
export function finishStatusToEntryOutcome(status: string): string | null {
  const s = status.trim().toLowerCase();
  if (!s || s === FINISH_STATUS_FIN || s === "finished") return "finished";
  if (FINISH_NON_FINISHER_CODES.includes(s)) return s;
  return null;
}

export function isNonFinisherStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return FINISH_NON_FINISHER_CODES.includes(s);
}
