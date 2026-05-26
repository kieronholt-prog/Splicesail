"use server";

import { redirect } from "next/navigation";

function seriesGeneratorPath(groupId: string, seriesId: string, qs?: string) {
  const q = qs ? `?${qs}` : "";
  return `/groups/${groupId}/series/${seriesId}${q}#race-series-generator`;
}

function trimOrNull(k: FormDataEntryValue | null): string | null {
  const s = String(k ?? "").trim();
  return s.length ? s : null;
}

const FLEETS_LOCKED_REASON =
  "Race fleets are controlled from this series saved race / series generator. Open the series page → Save generator, adjust applicable fleets, and save — that reapplies fleets to every race in the series except those with recorded finishes or marked results-final.";

/** Per-race fleet mutation is intentionally disabled — fleets propagate from saving the series race / series generator. */
function redirectRaceFleetMutationsBlocked(formData: FormData): never {
  const groupId = trimOrNull(formData.get("group_id")) ?? "";
  const seriesId = trimOrNull(formData.get("series_id")) ?? "";
  if (groupId && seriesId) {
    redirect(seriesGeneratorPath(groupId, seriesId, `error=${encodeURIComponent(FLEETS_LOCKED_REASON)}`));
  }
  redirect("/groups?error=" + encodeURIComponent(FLEETS_LOCKED_REASON));
}

/** @deprecated Fleet rows are seeded from series generator only — use Race / series generator → Save generator instead. */
export async function createRaceFleetAction(formData: FormData) {
  redirectRaceFleetMutationsBlocked(formData);
}

/** @deprecated Fleet rows are seeded from series generator only — use Race / series generator → Save generator instead. */
export async function updateRaceFleetAction(formData: FormData) {
  redirectRaceFleetMutationsBlocked(formData);
}

/** @deprecated Fleet rows are seeded from series generator only — use Race / series generator → Save generator instead. */
export async function deleteRaceFleetAction(formData: FormData) {
  redirectRaceFleetMutationsBlocked(formData);
}
