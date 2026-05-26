"use client";

import {
  deleteRaceGuestRoFinishManualAction,
  deleteRoFinishManualAction,
  removeAdhocRaceGuestEntryManageAction,
  saveRaceGuestRoFinishManualAction,
  saveRoFinishManualAction,
} from "@/app/actions/ro-finishes";
import { RoFinishEntryDetail } from "@/components/ro-finish-entry-detail";
import {
  FINISH_STATUS_FIN,
  finishStatusSelectValue,
  isNonFinisherStatus,
} from "@/lib/finish-outcome-labels";
import {
  latestRoFinishDatetimeLocal,
  roFinishDatetimeLocalDefault,
} from "@/lib/ro-finish-datetime-default";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type RoFinishEditTarget = {
  id: string;
  sailDisplay: string;
  boatTypeLabel: string;
  helmName: string;
  finishAt: string | null;
  finishPosition: number | null;
  outcome: string | null;
  guestRaceEntryId?: string | null;
  /** Race-only adhoc row (+ADDED) — may be removed from this dialog. */
  isAdhocRaceGuest?: boolean;
  fleetStartAtIso?: string | null;
  startedMarkedAt?: string | null;
  tallyAfloatAt?: string | null;
  tallyAshoreAt?: string | null;
};

export type RoFinishStatusOption = { code: string; label: string };

function targetHasRecordedResult(target: RoFinishEditTarget, positionalScoring: boolean): boolean {
  if (positionalScoring) {
    if (target.finishPosition != null && target.finishPosition >= 1) return true;
  } else if (target.finishAt) {
    return true;
  }
  const outcome = target.outcome?.trim().toLowerCase() ?? "";
  return outcome !== "" && outcome !== "ocs";
}

export function RoFinishEditDialog({
  open,
  onClose,
  target,
  groupId,
  seriesId,
  raceId,
  clubTz,
  raceScheduledAtIso,
  allFinishAts,
  nonFinisherStatuses,
  positionalScoring,
}: {
  open: boolean;
  onClose: () => void;
  target: RoFinishEditTarget | null;
  groupId: string;
  seriesId: string;
  raceId: string;
  clubTz: string;
  raceScheduledAtIso: string;
  allFinishAts: (string | null)[];
  nonFinisherStatuses: RoFinishStatusOption[];
  positionalScoring: boolean;
}) {
  const router = useRouter();
  const titleId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const lastFinishLocal = latestRoFinishDatetimeLocal(raceScheduledAtIso, allFinishAts, clubTz);

  const [status, setStatus] = useState<string>(FINISH_STATUS_FIN);
  const [finishLocal, setFinishLocal] = useState("");
  const [finishPosition, setFinishPosition] = useState("");
  const [allowEqualPosition, setAllowEqualPosition] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open || !target) return;
    setError(null);
    setAllowEqualPosition(false);
    setDeleteConfirmOpen(false);
    const hasFinishRecord = positionalScoring
      ? target.finishPosition != null && target.finishPosition >= 1
      : Boolean(target.finishAt);
    setStatus(finishStatusSelectValue(target.outcome, hasFinishRecord));
    setFinishLocal(
      roFinishDatetimeLocalDefault(raceScheduledAtIso, lastFinishLocal, target.finishAt, clubTz),
    );
    setFinishPosition(
      target.finishPosition != null && target.finishPosition >= 1 ? String(target.finishPosition) : "",
    );
  }, [open, target, raceScheduledAtIso, lastFinishLocal, clubTz, positionalScoring]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (open && e.key === "Escape" && !pending) {
        if (deleteConfirmOpen) {
          setDeleteConfirmOpen(false);
          return;
        }
        onClose();
      }
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, pending, onClose, deleteConfirmOpen]);

  if (!open || !target) return null;

  const showTime = !positionalScoring && !isNonFinisherStatus(status);
  const showPosition = positionalScoring && !isNonFinisherStatus(status);

  const isGuest = Boolean(target.guestRaceEntryId);
  const canRemoveAddedBoat = Boolean(target.isAdhocRaceGuest && target.guestRaceEntryId);
  const canDeleteResult = targetHasRecordedResult(target, positionalScoring);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = isGuest
        ? await saveRaceGuestRoFinishManualAction({
            group_id: groupId,
            series_id: seriesId,
            race_id: raceId,
            race_guest_entry_id: target!.guestRaceEntryId!,
            ro_finish_at_local: showTime ? finishLocal.trim() : undefined,
            finish_position: showPosition ? finishPosition.trim() : undefined,
            allow_equal_position: allowEqualPosition,
          })
        : await saveRoFinishManualAction({
            group_id: groupId,
            series_id: seriesId,
            race_id: raceId,
            race_entry_id: target!.id,
            finish_status: status,
            finish_at_local: showTime ? finishLocal.trim() : undefined,
            finish_position: showPosition ? finishPosition.trim() : undefined,
            allow_equal_position: allowEqualPosition,
          });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function handleDeleteResult() {
    if (!canDeleteResult || !target) return;
    setError(null);
    startTransition(async () => {
      const res = isGuest
        ? await deleteRaceGuestRoFinishManualAction({
            group_id: groupId,
            series_id: seriesId,
            race_id: raceId,
            race_guest_entry_id: target!.guestRaceEntryId!,
          })
        : await deleteRoFinishManualAction({
            group_id: groupId,
            series_id: seriesId,
            race_id: raceId,
            race_entry_id: target!.id,
          });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function handleRemoveAddedBoat() {
    const guestId = target?.guestRaceEntryId;
    if (!canRemoveAddedBoat || !guestId || !target) return;
    const label = target.sailDisplay || "this boat";
    if (
      !window.confirm(
        `Remove race-only sail ${label} from this race? This cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await removeAdhocRaceGuestEntryManageAction({
        group_id: groupId,
        series_id: seriesId,
        race_id: raceId,
        race_guest_entry_id: guestId,
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
          Finish · sail {target.sailDisplay}
        </h2>
        <p className="mt-1 text-sm text-splice-ocean dark:text-splice-water">
          {target.boatTypeLabel}
          {target.helmName ? ` · ${target.helmName}` : ""}
        </p>

        <RoFinishEntryDetail
          clubTz={clubTz}
          fleetStartAtIso={target.fleetStartAtIso ?? null}
          startedMarkedAt={target.startedMarkedAt ?? null}
          tallyAfloatAt={target.tallyAfloatAt ?? null}
          tallyAshoreAt={target.tallyAshoreAt ?? null}
          finishAt={target.finishAt}
          finishPosition={target.finishPosition}
          outcome={target.outcome}
          isGuest={isGuest}
          positionalScoring={positionalScoring}
        />

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          {!isGuest ? (
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-splice-blue dark:text-splice-water">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm normal-case text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
              >
                <option value={FINISH_STATUS_FIN}>
                  {positionalScoring ? "FIN — Finished (with finish position)" : "FIN — Finished (with finish time)"}
                </option>
                {nonFinisherStatuses.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {showPosition || (isGuest && positionalScoring) ? (
            <>
              <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-splice-blue dark:text-splice-water">
                Finish position
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={finishPosition}
                  onChange={(e) => setFinishPosition(e.target.value)}
                  className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm normal-case text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                />
              </label>
              <label className="flex items-start gap-2 text-xs normal-case text-splice-ocean dark:text-splice-water">
                <input
                  type="checkbox"
                  checked={allowEqualPosition}
                  onChange={(e) => setAllowEqualPosition(e.target.checked)}
                  className="mt-0.5 rounded border-splice-water dark:border-splice-ocean"
                />
                <span>
                  <strong className="font-medium text-splice-navy-light dark:text-splice-sky">Equal position</strong> — allow
                  a tie at this place without moving other boats. When unchecked, boats at this position and below shift
                  down one place to make room.
                </span>
              </label>
            </>
          ) : null}

          {showTime || (isGuest && !positionalScoring) ? (
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
          ) : !isGuest ? (
            <p className="text-xs text-splice-blue dark:text-splice-water">
              Non-finisher statuses do not store a finish{" "}
              {positionalScoring ? "position" : "time"}. Any previous finish record for this entry will be cleared.
            </p>
          ) : null}

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200" role="alert">
              {error}
            </p>
          ) : null}

          {deleteConfirmOpen ? (
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 dark:border-red-900/60 dark:bg-red-950/40"
              role="region"
              aria-label="Confirm delete result"
            >
              <p className="text-sm text-red-900 dark:text-red-100">
                Remove the recorded result for sail {target.sailDisplay}? The boat will return to started with no finish
                time, position, or penalty status.
              </p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="rounded-lg border border-splice-water px-4 py-2 text-sm font-medium text-splice-navy-light disabled:opacity-50 dark:border-splice-ocean dark:text-splice-sky"
                >
                  Go back
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleDeleteResult}
                  className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-red-800 dark:bg-red-800 dark:hover:bg-red-700"
                >
                  {pending ? "Deleting…" : "Yes, delete result"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap gap-2">
              {canDeleteResult && !deleteConfirmOpen ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-800 disabled:opacity-50 hover:bg-red-50 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950/40"
                >
                  Delete result
                </button>
              ) : null}
              {canRemoveAddedBoat ? (
                <button
                  type="button"
                  disabled={pending || deleteConfirmOpen}
                  onClick={handleRemoveAddedBoat}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-800 disabled:opacity-50 hover:bg-red-50 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950/40"
                >
                  {pending ? "Working…" : "− Remove boat"}
                </button>
              ) : null}
            </div>
            {!canDeleteResult && !canRemoveAddedBoat ? <span className="min-w-0 flex-1" aria-hidden /> : null}
            {!deleteConfirmOpen ? (
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
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
