"use client";

import { useState } from "react";
import type { RaceMatchCandidate } from "@/lib/track-race-matching";
import { confirmRaceBoatAction } from "@/app/actions/track-submissions";

export function RaceBoatConfirmForm({
  submissionId,
  candidates,
  defaultRaceId,
}: {
  submissionId: string;
  candidates: RaceMatchCandidate[];
  defaultRaceId?: string | null;
}) {
  const [raceId, setRaceId] = useState(defaultRaceId ?? candidates[0]?.raceId ?? "");
  const selected = candidates.find((c) => c.raceId === raceId) ?? candidates[0];
  const [boatId, setBoatId] = useState(selected?.boats[0]?.boatId ?? "");

  return (
    <form action={confirmRaceBoatAction} className="flex flex-col gap-4">
      <input type="hidden" name="submission_id" value={submissionId} />

      <label className="flex flex-col gap-1 text-sm font-medium">
        Race
        <select
          name="race_id"
          value={raceId}
          onChange={(e) => {
            setRaceId(e.target.value);
            const c = candidates.find((x) => x.raceId === e.target.value);
            setBoatId(c?.boats[0]?.boatId ?? "");
          }}
          className="rounded-lg border border-splice-water px-3 py-2 dark:border-splice-ocean dark:bg-splice-navy"
          required
        >
          {candidates.map((c) => (
            <option key={c.raceId} value={c.raceId}>
              {c.groupName} — {c.raceName} ({c.scheduledAtLabel})
              {c.hasEntry ? " · entered" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Boat
        <select
          name="boat_id"
          value={boatId}
          onChange={(e) => setBoatId(e.target.value)}
          className="rounded-lg border border-splice-water px-3 py-2 dark:border-splice-ocean dark:bg-splice-navy"
          required
        >
          {(selected?.boats ?? []).map((b) => (
            <option key={b.boatId} value={b.boatId}>
              {b.label ?? "Boat"} {b.sailNumber ? `#${b.sailNumber}` : ""}
            </option>
          ))}
        </select>
      </label>

      {selected && selected.boats.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          No race entry found for this race — tally for the race first or pick another race.
        </p>
      ) : null}

      <button
        type="submit"
        className="rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
      >
        Confirm race and boat
      </button>
    </form>
  );
}
