"use client";

import {
  ENTRY_STATUS_CHIPS_ROW_W_CLASS,
  EntryTallyStartedChips,
  RO_ENTRY_BADGE_MIN_H_CLASS,
} from "@/components/entry-tally-started-chips";
import {
  RoFinishEditDialog,
  type RoFinishEditTarget,
  type RoFinishStatusOption,
} from "@/components/ro-finish-edit-dialog";
import { RoBadgeQuickFilters } from "@/components/ro-badge-quick-filters";
import { RoFleetFlagBadge } from "@/components/ro-fleet-flag-badge";
import type { RoFleetStartRow } from "@/components/ro-fleet-start-signals-panel";
import {
  addAdhocRaceGuestEntryAction,
  recordRaceGuestRoFinishNowAction,
  recordRoFinishNowAction,
} from "@/app/actions/ro-finishes";
import type { RoRaceOnlyClassOption } from "@/components/ro-race-presence-buttons";
import { formatClubDateTimeMediumShort, formatClubHmsFromIso } from "@/lib/club-display-format";
import { finishStatusDisplay } from "@/lib/finish-outcome-labels";
import { wallTimeMs } from "@/lib/wall-time";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

const TAP_GAP_MS = 380;

/** Vertical space between rows inside a finish badge (doubled from default tight stack). */
const BADGE_ROW_GAP_CLASS = "gap-2";

const FINISH_BADGE_BUTTON_CLASS = `flex w-full flex-col ${BADGE_ROW_GAP_CLASS} ${RO_ENTRY_BADGE_MIN_H_CLASS} overflow-hidden rounded-lg border px-1.5 py-1 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-splice-water`;

/** Reserved row for helm name and/or finish time so every tile matches height. */
const FINISH_BADGE_FOOTER_ROW_CLASS =
  "flex min-h-[1.125rem] min-w-0 flex-nowrap items-center gap-0.5";

export type RoFinishBadgeEntry = {
  id: string;
  sailDisplay: string;
  boatTypeLabel: string;
  helmName: string;
  fleetId: string | null;
  finishAt: string | null;
  finishPosition: number | null;
  outcome: string | null;
  tallyAfloatAt: string | null;
  tallyAshoreAt: string | null;
  startedMarkedAt: string | null;
  fleetStartAtIso?: string | null;
  guestRaceEntryId?: string | null;
  badge?: string | null;
  /** Race-only adhoc guest row (+ADDED). */
  isAdhocRaceGuest?: boolean;
};

export type RoFinishFleetOption = { id: string; name: string };

function entryHasFinishRecord(entry: RoFinishBadgeEntry, positionalScoring: boolean): boolean {
  if (positionalScoring) {
    return entry.finishPosition != null && entry.finishPosition >= 1;
  }
  return Boolean(entry.finishAt);
}

function finishRecordLabel(
  entry: RoFinishBadgeEntry,
  positionalScoring: boolean,
  clubTz: string,
): string | null {
  if (positionalScoring) {
    if (entry.finishPosition != null && entry.finishPosition >= 1) {
      return String(entry.finishPosition);
    }
    return finishStatusDisplay(entry.outcome);
  }
  if (entry.finishAt) {
    return formatClubHmsFromIso(entry.finishAt, clubTz);
  }
  return finishStatusDisplay(entry.outcome);
}

function CheckeredFlagIcon({ className }: { className?: string }) {
  const light =
    "repeating-conic-gradient(from 90deg, #fafafa 0% 25%, #18181b 0% 50%) 0 0 / 10px 10px";
  const dark =
    "repeating-conic-gradient(from 90deg, #52525b 0% 25%, #18181b 0% 50%) 0 0 / 10px 10px";
  return (
    <>
      <span
        className={`dark:hidden inline-block size-3.5 shrink-0 rounded-sm ring-1 ring-inset ring-splice-water ${className ?? ""}`}
        style={{ background: light }}
        aria-hidden
      />
      <span
        className={`hidden dark:inline-block size-3.5 shrink-0 rounded-sm ring-1 ring-inset ring-splice-ocean ${className ?? ""}`}
        style={{ background: dark }}
        aria-hidden
      />
    </>
  );
}

function RoFinishOverwriteConfirmDialog({
  open,
  entry,
  clubTz,
  pending,
  onCancel,
  onSaveNewTime,
  onOpenManual,
}: {
  open: boolean;
  entry: RoFinishBadgeEntry | null;
  clubTz: string;
  pending: boolean;
  onCancel: () => void;
  onSaveNewTime: () => void;
  onOpenManual: () => void;
}) {
  const titleId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (open && e.key === "Escape" && !pending) onCancel();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, pending, onCancel]);

  if (!open || !entry) return null;

  const nowLabel = formatClubDateTimeMediumShort(new Date().toISOString(), clubTz);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={(e) => {
        if (e.target === backdropRef.current && !pending) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-splice-sky bg-white p-5 shadow-lg outline-none dark:border-splice-ocean dark:bg-splice-navy"
      >
        <h2 id={titleId} className="text-lg font-semibold text-splice-navy dark:text-splice-surface">
          Replace finish time?
        </h2>
        <p className="mt-1 text-sm text-splice-ocean dark:text-splice-water">
          Sail {entry.sailDisplay} · {entry.boatTypeLabel}
        </p>
        <dl className="mt-4 space-y-2 rounded-lg bg-splice-surface px-3 py-3 text-sm dark:bg-splice-navy/60">
          <div className="flex justify-between gap-3">
            <dt className="text-splice-blue dark:text-splice-water">Current finish</dt>
            <dd className="font-mono tabular-nums text-splice-navy dark:text-splice-foam">
              {formatClubDateTimeMediumShort(entry.finishAt, clubTz)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-splice-blue dark:text-splice-water">New time (now)</dt>
            <dd className="font-mono tabular-nums text-emerald-800 dark:text-emerald-200">{nowLabel}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-splice-ocean dark:text-splice-water">
          This boat already has a finish time. Confirm you want to stamp the current time, or open manual entry to
          adjust the time or status.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded-lg border border-splice-water px-4 py-2 text-sm font-medium text-splice-navy-light disabled:opacity-50 dark:border-splice-ocean dark:text-splice-sky"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onOpenManual}
            className="rounded-lg border border-splice-water px-4 py-2 text-sm font-medium text-splice-navy disabled:opacity-50 dark:border-splice-blue dark:text-splice-foam"
          >
            Open manual entry
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onSaveNewTime}
            className="rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-splice-foam dark:text-splice-navy"
          >
            {pending ? "Saving…" : "Save new time"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RoFinishBadges({
  groupId,
  seriesId,
  raceId,
  clubTz,
  raceScheduledAtIso,
  entries,
  fleets,
  raceFleets,
  nonFinisherStatuses,
  resultsFinal,
  positionalScoring,
  raceOnlyAdd,
}: {
  groupId: string;
  seriesId: string;
  raceId: string;
  clubTz: string;
  raceScheduledAtIso: string;
  entries: RoFinishBadgeEntry[];
  fleets: RoFinishFleetOption[];
  raceFleets: RoFleetStartRow[];
  nonFinisherStatuses: RoFinishStatusOption[];
  resultsFinal: boolean;
  positionalScoring: boolean;
  raceOnlyAdd?: { classOptions: RoRaceOnlyClassOption[] } | null;
}) {
  const router = useRouter();
  const [addPending, startAddTransition] = useTransition();
  const addDialogRef = useRef<HTMLDialogElement>(null);
  const addSubmittingRef = useRef(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<RoFinishEditTarget | null>(null);
  const [overwriteEntry, setOverwriteEntry] = useState<RoFinishBadgeEntry | null>(null);

  const tapRef = useRef<{ lastAt: number; count: number; timer: ReturnType<typeof setTimeout> | null }>({
    lastAt: 0,
    count: 0,
    timer: null,
  });

  const fleetById = useMemo(() => {
    const m = new Map<string, RoFleetStartRow>();
    for (const f of raceFleets) m.set(f.id, f);
    return m;
  }, [raceFleets]);

  const allFinishAts = useMemo(() => entries.map((e) => e.finishAt), [entries]);

  const filterables = useMemo(
    () =>
      entries.map((e) => ({
        id: e.id,
        sailDisplay: e.sailDisplay,
        boatTypeLabel: e.boatTypeLabel,
        helmName: e.helmName,
        fleetId: e.fleetId,
      })),
    [entries],
  );

  const showAddTile = Boolean(raceOnlyAdd) && !resultsFinal;
  const classOptions = raceOnlyAdd?.classOptions ?? [];

  const handleAddRaceOnlySubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (addSubmittingRef.current || addPending) return;
      addSubmittingRef.current = true;
      const formData = new FormData(e.currentTarget);
      startAddTransition(async () => {
        try {
          await addAdhocRaceGuestEntryAction(formData);
        } finally {
          addSubmittingRef.current = false;
        }
      });
    },
    [addPending, startAddTransition],
  );

  const recordFinishNow = useCallback(
    (entry: RoFinishBadgeEntry, onDone?: () => void) => {
      if (resultsFinal) return;
      setError(null);
      startTransition(async () => {
        const res = entry.guestRaceEntryId
          ? await recordRaceGuestRoFinishNowAction({
              group_id: groupId,
              series_id: seriesId,
              race_id: raceId,
              race_guest_entry_id: entry.guestRaceEntryId,
            })
          : await recordRoFinishNowAction({
              group_id: groupId,
              series_id: seriesId,
              race_id: raceId,
              race_entry_id: entry.id,
            });
        if (res.error) {
          setError(res.error);
          return;
        }
        onDone?.();
        router.refresh();
      });
    },
    [groupId, seriesId, raceId, resultsFinal, router],
  );

  const openEditDialog = useCallback((entry: RoFinishBadgeEntry) => {
    setEditTarget({
      id: entry.id,
      sailDisplay: entry.sailDisplay,
      boatTypeLabel: entry.boatTypeLabel,
      helmName: entry.helmName,
      finishAt: entry.finishAt,
      finishPosition: entry.finishPosition,
      outcome: entry.outcome,
      guestRaceEntryId: entry.guestRaceEntryId ?? null,
      isAdhocRaceGuest: entry.isAdhocRaceGuest ?? false,
      fleetStartAtIso: entry.fleetStartAtIso ?? null,
      startedMarkedAt: entry.startedMarkedAt,
      tallyAfloatAt: entry.tallyAfloatAt,
      tallyAshoreAt: entry.tallyAshoreAt,
    });
  }, []);

  const onSearchEnter = useCallback(
    (entryId: string) => {
      const entry = entries.find((e) => e.id === entryId);
      if (entry && !resultsFinal && !pending) openEditDialog(entry);
    },
    [entries, resultsFinal, pending, openEditDialog],
  );

  const flushTap = useCallback(
    (entry: RoFinishBadgeEntry) => {
      const st = tapRef.current;
      st.timer = null;
      const c = st.count;
      st.count = 0;

      if (resultsFinal || pending) return;

      if (c >= 2) {
        openEditDialog(entry);
        return;
      }

      if (c === 1) {
        const hasFinish = entryHasFinishRecord(entry, positionalScoring);
        if (hasFinish) {
          if (positionalScoring) {
            openEditDialog(entry);
          } else {
            setOverwriteEntry(entry);
          }
        } else {
          recordFinishNow(entry);
        }
      }
    },
    [resultsFinal, pending, openEditDialog, recordFinishNow, positionalScoring],
  );

  const onPointerUpEntry = useCallback(
    (entry: RoFinishBadgeEntry) => {
      if (resultsFinal || pending) return;
      const now = wallTimeMs();
      const st = tapRef.current;
      if (st.timer) clearTimeout(st.timer);
      if (now - st.lastAt < TAP_GAP_MS) st.count += 1;
      else st.count = 1;
      st.lastAt = now;
      st.timer = setTimeout(() => flushTap(entry), TAP_GAP_MS);
    },
    [resultsFinal, pending, flushTap],
  );

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200" role="alert">
          {error}
        </p>
      ) : null}

      <RoBadgeQuickFilters fleets={fleets} filterables={filterables} onSearchEnter={onSearchEnter}>
        {(filteredIds, searchNav, _filterState) => {
          const filtered = entries.filter((e) => filteredIds.has(e.id));
          return (
            <>
              <ul className="flex flex-wrap gap-1.5">
                {filtered.map((e) => {
                  const searchHighlighted = searchNav.highlightId === e.id;
                  const hasFinishRecord = entryHasFinishRecord(e, positionalScoring);
                  const isFinished = hasFinishRecord || (e.outcome != null && e.outcome !== "finished");
                  const fleet = e.fleetId ? fleetById.get(e.fleetId) : undefined;
                  const statusLabel = finishRecordLabel(e, positionalScoring, clubTz);
                  const isGuest = Boolean(e.guestRaceEntryId);
                  const showHelm = Boolean(e.helmName?.trim() && e.helmName.trim() !== "—");

                  return (
                    <li key={e.id} className={`shrink-0 ${ENTRY_STATUS_CHIPS_ROW_W_CLASS}`}>
                      <button
                        id={`ro-badge-${e.id}`}
                        type="button"
                        disabled={resultsFinal || pending}
                        onPointerUp={() => onPointerUpEntry(e)}
                        className={`relative ${FINISH_BADGE_BUTTON_CLASS} ${
                        resultsFinal || pending
                          ? "cursor-not-allowed opacity-60"
                          : "active:scale-[0.98] hover:border-splice-water/70 hover:shadow-sm dark:hover:border-splice-blue/50"
                      } ${
                        searchHighlighted
                          ? "ring-2 ring-splice-blue ring-offset-1 ring-offset-white dark:ring-splice-water dark:ring-offset-splice-navy"
                          : ""
                      } ${
                        isGuest
                          ? isFinished
                            ? "border-violet-400/80 bg-violet-50/90 dark:border-violet-600/50 dark:bg-violet-950/30"
                            : "border-dashed border-violet-300 bg-violet-50/60 dark:border-violet-600 dark:bg-violet-950/25"
                          : isFinished
                            ? "border-emerald-400/80 bg-emerald-50/90 dark:border-emerald-600/50 dark:bg-emerald-950/30"
                            : "border-splice-sky bg-white dark:border-splice-ocean dark:bg-splice-navy"
                      }`}
                    >
                      <div className="flex w-full min-w-0 items-start gap-1">
                        <span className="min-w-0 flex-1 truncate font-mono text-lg font-bold tabular-nums leading-none tracking-tight text-splice-navy dark:text-splice-surface">
                          {e.sailDisplay || "—"}
                        </span>
                        <span className="flex shrink-0 items-center gap-0.5">
                          {fleet ? (
                            <RoFleetFlagBadge
                              fleet={fleet}
                              sizeClass="pointer-events-none block h-5 w-5 shrink-0"
                            />
                          ) : null}
                          {hasFinishRecord ? (
                            <span title="Finished">
                              <CheckeredFlagIcon />
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium leading-tight text-splice-ocean dark:text-splice-water">
                          {e.boatTypeLabel}
                        </span>
                      </div>
                      <div className="min-w-0 w-full max-w-full">
                        <EntryTallyStartedChips
                          tallyAfloatAt={e.tallyAfloatAt}
                          tallyAshoreAt={e.tallyAshoreAt}
                          startedMarkedAt={e.startedMarkedAt}
                          addedBadgeLabel={e.badge}
                          nowrap
                        />
                      </div>
                      <div
                        className={`${FINISH_BADGE_FOOTER_ROW_CLASS} ${showHelm ? "justify-between" : "justify-end"}`}
                      >
                        {showHelm ? (
                          <span className="min-w-0 flex-1 truncate text-[11px] leading-tight text-splice-blue dark:text-splice-water">
                            {e.helmName}
                          </span>
                        ) : (
                          <span className="min-w-0 flex-1" aria-hidden />
                        )}
                        {isFinished ? (
                          <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums leading-none text-emerald-800 dark:text-emerald-200">
                            {statusLabel}
                          </span>
                        ) : null}
                      </div>
                      </button>
                    </li>
                  );
                })}
                {showAddTile ? (
                  <li className={`shrink-0 ${ENTRY_STATUS_CHIPS_ROW_W_CLASS}`}>
                    <button
                      type="button"
                      disabled={addPending}
                      onClick={() => addDialogRef.current?.showModal()}
                      className={`${FINISH_BADGE_BUTTON_CLASS} border-dashed border-violet-300 bg-violet-50/60 hover:bg-violet-100 focus-visible:ring-violet-400 disabled:opacity-50 dark:border-violet-600 dark:bg-violet-950/25 dark:hover:bg-violet-950/40`}
                    >
                      <div className="flex justify-start">
                        <span className="shrink-0 rounded bg-violet-800 px-2 py-0.5 text-[18px] font-semibold leading-none tracking-wide text-white dark:bg-violet-300 dark:text-violet-950">
                          +ADD BOAT
                        </span>
                      </div>
                      <span className="truncate text-xs font-medium leading-tight text-violet-800 dark:text-violet-200">
                        This race only
                      </span>
                      <div className="min-h-[0.875rem] w-full shrink-0" aria-hidden />
                      <div className={FINISH_BADGE_FOOTER_ROW_CLASS} aria-hidden />
                    </button>
                  </li>
                ) : null}
              </ul>

              {!filtered.length && !showAddTile ? (
                <p className="text-sm text-splice-blue dark:text-splice-water">No boats match the current filters.</p>
              ) : null}
            </>
          );
        }}
      </RoBadgeQuickFilters>

      <RoFinishOverwriteConfirmDialog
        open={overwriteEntry != null}
        entry={overwriteEntry}
        clubTz={clubTz}
        pending={pending}
        onCancel={() => setOverwriteEntry(null)}
        onSaveNewTime={() => {
          if (!overwriteEntry) return;
          recordFinishNow(overwriteEntry, () => setOverwriteEntry(null));
        }}
        onOpenManual={() => {
          if (!overwriteEntry) return;
          const entry = overwriteEntry;
          setOverwriteEntry(null);
          openEditDialog(entry);
        }}
      />

      <RoFinishEditDialog
        open={editTarget != null}
        onClose={() => setEditTarget(null)}
        target={editTarget}
        groupId={groupId}
        seriesId={seriesId}
        raceId={raceId}
        clubTz={clubTz}
        raceScheduledAtIso={raceScheduledAtIso}
        allFinishAts={allFinishAts}
        nonFinisherStatuses={nonFinisherStatuses}
        positionalScoring={positionalScoring}
      />

      {showAddTile ? (
        <dialog
          ref={addDialogRef}
          aria-labelledby="ro-finish-add-race-only-title"
          className="w-[calc(100%-2rem)] max-w-md rounded-xl border border-splice-sky bg-white p-0 text-splice-navy shadow-xl backdrop:bg-splice-navy/50 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
        >
          <div className="border-b border-splice-foam px-5 py-4 dark:border-splice-navy-light">
            <h3 id="ro-finish-add-race-only-title" className="text-base font-semibold text-splice-navy dark:text-splice-surface">
              Add race-only boat
            </h3>
            <p className="mt-2 text-xs text-splice-ocean dark:text-splice-water">
              Sail number and class only — appears on the finish grid when started. Link to a series signup later from
              club admin if needed.
            </p>
          </div>
          <div className="px-5 py-4">
            {classOptions.length ? (
              <form onSubmit={handleAddRaceOnlySubmit} className="flex flex-col gap-4">
                <input type="hidden" name="group_id" value={groupId} />
                <input type="hidden" name="series_id" value={seriesId} />
                <input type="hidden" name="race_id" value={raceId} />
                <input type="hidden" name="return_to" value="finishes" />
                <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
                  Sail number
                  <input
                    name="adhoc_sail_number"
                    required
                    autoComplete="off"
                    className="mt-1 rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
                  Class
                  <select
                    name="adhoc_rya_class_key"
                    required
                    className="mt-1 rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Choose class…
                    </option>
                    {classOptions.map((c) => (
                      <option key={c.class_key} value={c.class_key}>
                        {c.display_name ?? c.class_key}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={addPending}
                    className="rounded-lg border border-splice-water px-4 py-2 text-sm font-medium text-splice-navy-light hover:bg-splice-surface disabled:opacity-50 dark:border-splice-ocean dark:text-splice-sky dark:hover:bg-splice-navy-light/80"
                    onClick={() => addDialogRef.current?.close()}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addPending}
                    className="rounded-lg bg-violet-800 px-4 py-2 text-sm font-medium text-white hover:bg-violet-900 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                  >
                    {addPending ? "Adding…" : "Add race-only boat"}
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-xs text-amber-800 dark:text-amber-200/90">
                No boat classes are available for this club yet — add classes in Club admin before recording ad-hoc
                boats.
              </p>
            )}
            {!classOptions.length ? (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="rounded-lg border border-splice-water px-4 py-2 text-sm font-medium text-splice-navy-light dark:border-splice-ocean dark:text-splice-sky"
                  onClick={() => addDialogRef.current?.close()}
                >
                  Close
                </button>
              </div>
            ) : null}
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
