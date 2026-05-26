"use client";

import { useState } from "react";
import type { RaceMatchCandidate } from "@/lib/track-race-matching";
import {
  spliceFieldClass,
  spliceFieldLabelClass,
} from "@/components/sailing-analysis/form-field-classes";
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

      <label className="flex flex-col gap-1">
        <span className={spliceFieldLabelClass}>Race</span>
        <select
          name="race_id"
          value={raceId}
          onChange={(e) => {
            setRaceId(e.target.value);
            const c = candidates.find((x) => x.raceId === e.target.value);
            setBoatId(c?.boats[0]?.boatId ?? "");
          }}
          className={spliceFieldClass}
          required
        >
          {candidates.map((c) => (
            <option key={c.raceId} value={c.raceId}>
              {c.seriesName} — {c.raceName} · {c.scheduledAtLabel}
              {c.hasEntry ? " · tallied" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={spliceFieldLabelClass}>Boat</span>
        <select
          name="boat_id"
          value={boatId}
          onChange={(e) => setBoatId(e.target.value)}
          className={spliceFieldClass}
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
          No boats on your series entry for this race — add a boat on series entries first, or pick another
          race.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!selected?.boats.length}
        className="rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-splice-foam dark:text-splice-navy"
      >
        Confirm race and boat
      </button>
    </form>
  );
}
