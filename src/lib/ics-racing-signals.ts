/** Common ICS / racing signal names for annotating fleets (informative naming). */

export type IcsSignalOption = {
  /** Stable value stored on race_fleets.ics_signal */
  code: string;
  /** Human-readable label */
  label: string;
};

export const ICS_RACING_SIGNAL_OPTIONS: readonly IcsSignalOption[] = [
  { code: "ap", label: "AP — Races not started / postponed (ashore)" },
  { code: "n_over_h", label: "N over H — All races abandoned (ashore)" },
  { code: "n", label: "N — Abandon all races — no signal ashore (afloat)" },
  { code: "s", label: "S — Shorten course — finish shortened (afloat)" },
  { code: "x", label: "X — Individual recall" },
  { code: "first_substitute", label: "First substitute — general recall (start)" },
  { code: "p", label: "P — Prep / preparatory signal" },
  { code: "i", label: "I — Rule 30.1 (round ends / one minute)" },
  { code: "z", label: "Z — Rule 30.2 (% penalty — one minute)" },
  { code: "black_flag", label: "Black rule 30.3 (disqualification without hearing)" },
  { code: "u", label: "U — U flag / Rule 30.3 alternate" },
  { code: "blue_peter", label: "Blue Peter — All persons report on board — vessel departing" },
  { code: "l", label: "L — Ashore signal (your notice board)" },
  { code: "y", label: "Y — Wear lifejacket" },
  { code: "a", label: "A — Diver below — slow / keep clear" },
] as const;

const RACING_ICS_CODE_SET = new Set(ICS_RACING_SIGNAL_OPTIONS.map((o) => o.code));

/**
 * Letter/numeral pennants matching /public/marine-signal-flags (dzangolab/marine-signal-flags).
 * Skips any `code` already defined above so option values stay unique.
 */
export const MARINE_PENNANT_EXTRA_OPTIONS: readonly IcsSignalOption[] = (() => {
  const out: IcsSignalOption[] = [];
  for (const d of "0123456789") {
    if (!RACING_ICS_CODE_SET.has(d)) {
      out.push({ code: d, label: `${d} — Numeral pennant ${d}` });
    }
  }
  for (const c of "abcdefghijklmnopqrstuvwxyz") {
    if (!RACING_ICS_CODE_SET.has(c)) {
      out.push({
        code: c,
        label: `${c.toUpperCase()} — Letter pennant ${c.toUpperCase()}`,
      });
    }
  }
  return out;
})();

/** Race fleet flag annotation & select: racing signals, then extra pennants. */
export const FLEET_FLAG_ANNOTATION_OPTIONS: readonly IcsSignalOption[] = [
  ...ICS_RACING_SIGNAL_OPTIONS,
  ...MARINE_PENNANT_EXTRA_OPTIONS,
];
