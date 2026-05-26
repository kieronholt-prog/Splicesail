export function startSequenceLabel(code: string | null | undefined): string {
  switch (code) {
    case "10_5_1_go":
      return "10, 5, 1, Go";
    case "5_4_1_go":
      return "5, 4, 1, Go";
    case "3_2_1_go":
      return "3, 2, 1, Go";
    default:
      return "5, 4, 1, Go";
  }
}

/**
 * Minutes remaining at each horn: warning (class flag), preparatory up, preparatory down, then start (class down).
 */
export function parseStartSequenceMinutes(code: string | null | undefined): [number, number, number] {
  const c = code ?? "5_4_1_go";
  const m = /^(\d+)_(\d+)_(\d+)_go$/.exec(String(c).trim());
  if (!m) return [5, 4, 1];
  return [+m[1], +m[2], +m[3]];
}

/**
 * Minutes to add to the start signal when "Postponement down" is used after a postponement:
 * warning interval + preparatory-down interval (e.g. 3+1=4 for 3,2,1 — 5+1=6 for 5,4,1).
 */
export function postponementDownShiftMinutes(code: string | null | undefined): number {
  const [warning, , prepDown] = parseStartSequenceMinutes(code);
  return warning + prepDown;
}
