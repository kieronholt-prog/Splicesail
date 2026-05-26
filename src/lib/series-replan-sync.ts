/** Match planned generator slots to existing unpublished races (reuse rows on replan). */

export type UnpublishedRaceRow = {
  id: string;
  name: string;
  scheduled_at: string;
};

export type ReplanRaceUpdate = {
  id: string;
  name: string;
  scheduled_at: string;
  /** When true, replan may rename but must not change start time (recorded finishes). */
  startTimeLocked: boolean;
};

export type ReplanRaceInsert = {
  name: string;
  scheduled_at: string;
};

export type ReplanSyncPlan = {
  toUpdate: ReplanRaceUpdate[];
  toInsert: ReplanRaceInsert[];
  toRemove: UnpublishedRaceRow[];
  /** Planned slots paired with an existing row (includes start-time-locked). */
  matchedCount: number;
  /** Matched rows whose start time will stay unchanged due to recorded finishes. */
  startTimeLockedCount: number;
};

export type ReplanSyncPlanOptions = {
  /** Race ids with recorded finishes — start time and deletion are blocked. */
  lockedStartTimeRaceIds?: Set<string>;
};

/**
 * Pair by sequence: sort both lists by start time, match 1st→1st, 2nd→2nd, etc.
 * Unmatched planned slots are inserted; unmatched existing rows are removed unless locked.
 */
export function computeReplanSyncPlan(
  plannedDates: Date[],
  unpublishedExisting: UnpublishedRaceRow[],
  opts?: ReplanSyncPlanOptions,
): ReplanSyncPlan {
  const locked = opts?.lockedStartTimeRaceIds ?? new Set<string>();

  const sortedPlanned = [...plannedDates].sort((a, b) => a.getTime() - b.getTime());
  const sortedExisting = [...unpublishedExisting].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );

  const matchCount = Math.min(sortedPlanned.length, sortedExisting.length);
  const toUpdate: ReplanRaceUpdate[] = [];
  let startTimeLockedCount = 0;

  for (let i = 0; i < matchCount; i++) {
    const ex = sortedExisting[i]!;
    const plannedAt = sortedPlanned[i]!.toISOString();
    const startTimeLocked = locked.has(ex.id);
    if (startTimeLocked) {
      startTimeLockedCount += 1;
    }
    toUpdate.push({
      id: ex.id,
      name: `Race ${i + 1}`,
      scheduled_at: startTimeLocked ? ex.scheduled_at : plannedAt,
      startTimeLocked,
    });
  }

  const toInsert: ReplanRaceInsert[] = sortedPlanned.slice(matchCount).map((d, j) => ({
    name: `Race ${matchCount + j + 1}`,
    scheduled_at: d.toISOString(),
  }));

  const toRemove = sortedExisting.slice(matchCount).filter((ex) => !locked.has(ex.id));

  return {
    toUpdate,
    toInsert,
    toRemove,
    matchedCount: matchCount,
    startTimeLockedCount,
  };
}
