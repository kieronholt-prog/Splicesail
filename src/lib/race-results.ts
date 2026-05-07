/** Race-day provisional ordering from stored times (not protest-aware). */

export type EntryForResults = {
  id: string;
  user_id: string;
  boat_id: string | null;
  sail_number_override: string | null;
  outcome: string | null;
  started_marked_at: string | null;
};

export type FinishSlice = {
  official_finish_at: string | null;
  ro_finish_at: string | null;
};

export type RankedRow = {
  rank: number;
  entry: EntryForResults;
  officialFinishAt: string;
};

export type ResultNote = {
  entry: EntryForResults;
  note: string;
};

export function computeProvisionalResults(
  entries: EntryForResults[],
  finishByEntryId: Map<string, FinishSlice>,
): { ranked: RankedRow[]; notes: ResultNote[] } {
  const candidates = entries.filter((e) => {
    if (e.outcome !== "finished") return false;
    const fin = finishByEntryId.get(e.id);
    if (!fin?.official_finish_at) return false;
    if (!e.started_marked_at) return false;
    return true;
  });

  candidates.sort((a, b) => {
    const ta = new Date(
      finishByEntryId.get(a.id)!.official_finish_at!,
    ).getTime();
    const tb = new Date(
      finishByEntryId.get(b.id)!.official_finish_at!,
    ).getTime();
    return ta - tb;
  });

  const ranked: RankedRow[] = [];
  let rank = 1;
  for (let i = 0; i < candidates.length; i++) {
    const e = candidates[i];
    const official = finishByEntryId.get(e.id)!.official_finish_at!;
    if (i > 0) {
      const prevOfficial = finishByEntryId.get(
        candidates[i - 1].id,
      )!.official_finish_at!;
      if (official !== prevOfficial) rank = i + 1;
    }
    ranked.push({ rank, entry: e, officialFinishAt: official });
  }

  const rankedIds = new Set(ranked.map((r) => r.entry.id));
  const notes: ResultNote[] = [];

  for (const e of entries) {
    if (rankedIds.has(e.id)) continue;

    let note: string;
    const o = e.outcome?.trim();
    if (!o) note = "Outcome not set";
    else if (o === "finished") {
      if (!e.started_marked_at) note = "Finished — not marked started";
      else if (!finishByEntryId.get(e.id)?.official_finish_at)
        note = "Finished — no official time yet";
      else note = "Not ranked";
    } else {
      note = o.toUpperCase().replace(/_/g, " ");
    }

    notes.push({ entry: e, note });
  }

  return { ranked, notes };
}
