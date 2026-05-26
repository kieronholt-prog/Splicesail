export type RaceFleetRuleRow = {
  id: string;
  sort_order: number;
  filter_mode: "class_keys" | "py_range";
  class_keys: string[] | null;
  py_min: number | null;
  py_max: number | null;
};

/**
 * Chooses first matching fleet (`sort_order` ascending). Class match uses catalogue key;
 * PY match uses Portsmouth series chain + race override semantics (override replaces boat PN).
 */
export function matchFleetId(
  fleets: RaceFleetRuleRow[],
  opts: {
    boatClassKey: string | null;
    effectivePy: number | null;
  },
): string | null {
  const rows = [...fleets].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  for (const f of rows) {
    if (f.filter_mode === "class_keys") {
      const keys = f.class_keys ?? [];
      const k = opts.boatClassKey?.trim();
      if (k && keys.includes(k)) return f.id;
    } else if (f.filter_mode === "py_range") {
      const py = opts.effectivePy;
      if (
        py != null &&
        f.py_min != null &&
        f.py_max != null &&
        py >= f.py_min &&
        py <= f.py_max
      ) {
        return f.id;
      }
    }
  }
  return null;
}
