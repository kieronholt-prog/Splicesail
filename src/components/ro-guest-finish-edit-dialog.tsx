"use client";

import { saveRaceGuestRoFinishManualAction } from "@/app/actions/ro-finishes";
import {
  latestRoFinishDatetimeLocal,
  roFinishDatetimeLocalDefault,
} from "@/lib/ro-finish-datetime-default";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RoGuestFinishEditDialog({
  open,
  onClose,
  raceGuestEntryId,
  sailDisplay,
  helmLabel,
  groupId,
  seriesId,
  raceId,
  clubTz,
  raceScheduledAtIso,
  finishAt,
  allGuestFinishAts,
}: {
  open: boolean;
  onClose: () => void;
  raceGuestEntryId: string;
  sailDisplay: string;
  helmLabel: string;
  groupId: string;
  seriesId: string;
  raceId: string;
  clubTz: string;
  raceScheduledAtIso: string;
  finishAt: string | null;
  allGuestFinishAts: (string | null)[];
}) {
  const router = useRouter();
  const titleId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const lastLocal = latestRoFinishDatetimeLocal(raceScheduledAtIso, allGuestFinishAts, clubTz);
  const [finishLocal, setFinishLocal] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFinishLocal(
      roFinishDatetimeLocalDefault(raceScheduledAtIso, lastLocal, finishAt, clubTz),
    );
  }, [open, finishAt, raceScheduledAtIso, lastLocal, clubTz]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (open && e.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, pending, onClose]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveRaceGuestRoFinishManualAction({
        group_id: groupId,
        series_id: seriesId,
        race_id: raceId,
        race_guest_entry_id: raceGuestEntryId,
        ro_finish_at_local: finishLocal.trim(),
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={(e) => {
        if (e.target === backdropRef.current && !pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-splice-sky bg-white p-5 shadow-lg outline-none dark:border-splice-ocean dark:bg-splice-navy"
      >
        <h2 id={titleId} className="text-lg font-semibold text-splice-navy dark:text-splice-surface">
          Guest finish · sail {sailDisplay}
        </h2>
        <p className="mt-1 text-sm text-splice-ocean dark:text-splice-water">{helmLabel}</p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-splice-blue dark:text-splice-water">
            Finish time (club local)
            <input
              type="datetime-local"
              step={1}
              required
              value={finishLocal}
              onChange={(e) => setFinishLocal(e.target.value)}
              className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm normal-case text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={onClose}
              className="rounded-lg border border-splice-water px-4 py-2 text-sm font-medium text-splice-navy-light disabled:opacity-50 dark:border-splice-ocean dark:text-splice-sky"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-splice-foam dark:text-splice-navy"
            >
              {pending ? "Saving…" : "Save finish"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Opens guest finish dialog from server-rendered guest list rows. */
export function RoGuestFinishEditButton({
  raceGuestEntryId,
  sailDisplay,
  helmLabel,
  groupId,
  seriesId,
  raceId,
  clubTz,
  raceScheduledAtIso,
  finishAt,
  allGuestFinishAts,
}: {
  raceGuestEntryId: string;
  sailDisplay: string;
  helmLabel: string;
  groupId: string;
  seriesId: string;
  raceId: string;
  clubTz: string;
  raceScheduledAtIso: string;
  finishAt: string | null;
  allGuestFinishAts: (string | null)[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-splice-water px-3 py-1.5 text-xs font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
      >
        {finishAt ? "Edit finish" : "Set finish time"}
      </button>
      <RoGuestFinishEditDialog
        open={open}
        onClose={() => setOpen(false)}
        raceGuestEntryId={raceGuestEntryId}
        sailDisplay={sailDisplay}
        helmLabel={helmLabel}
        groupId={groupId}
        seriesId={seriesId}
        raceId={raceId}
        clubTz={clubTz}
        raceScheduledAtIso={raceScheduledAtIso}
        finishAt={finishAt}
        allGuestFinishAts={allGuestFinishAts}
      />
    </>
  );
}
