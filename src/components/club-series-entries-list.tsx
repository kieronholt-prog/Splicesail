"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { enterSeriesBulkAction } from "@/app/actions/enter-series";
import type { MemberClubSeriesRow } from "@/lib/group-series-entries-for-member";
import { formatBoatEntryLabel } from "@/lib/format-boat-entry-label";
import { withdrawSeriesHullAction, withdrawSeriesRegistrationAction } from "@/app/actions/series-registration";

export type SeriesEntriesRow = MemberClubSeriesRow;

type Props = {
  groupId: string;
  clubName?: string;
  /** On My Entries — club name as heading, no duplicate page intro. */
  embedded?: boolean;
  series: SeriesEntriesRow[];
  boats: {
    id: string;
    label: string;
    rya_class_key: string | null;
    class_name: string | null;
    default_sail_number: string | null;
  }[];
  profile: { email: string | null; display_name: string | null; phone: string | null };
};

type EntryStep = "boats" | "contact" | "disclaimer";

type WithdrawBoatTarget = {
  seriesId: string;
  seriesName: string;
  boatId: string;
  boatLabel: string;
};

function boatsEnteredSummary(entered: number, owned: number): string {
  const ownedLabel = owned === 1 ? "Boat" : "Boats";
  return `${entered} of ${owned} ${ownedLabel} Entered`;
}

type SeriesBoatEntryHighlight = "red" | "amber" | "green";

/** My Entries — row tint from how many fleet boats are on the series signup. */
function seriesBoatEntryHighlight(boatsEntered: number, boatsOwned: number): SeriesBoatEntryHighlight {
  if (boatsEntered === 0) return "red";
  if (boatsOwned > 0 && boatsEntered >= boatsOwned) return "green";
  return "amber";
}

function seriesBoatEntryHighlightClasses(highlight: SeriesBoatEntryHighlight): string {
  switch (highlight) {
    case "red":
      return "border-l-4 border-l-red-400 bg-red-50/90 dark:border-l-red-600 dark:bg-red-950/30";
    case "green":
      return "border-l-4 border-l-emerald-500 bg-emerald-50/90 dark:border-l-emerald-600 dark:bg-emerald-950/30";
    case "amber":
      return "border-l-4 border-l-amber-400 bg-amber-50/90 dark:border-l-amber-600 dark:bg-amber-950/30";
  }
}

function seriesBoatEntrySummaryClasses(highlight: SeriesBoatEntryHighlight): string {
  switch (highlight) {
    case "red":
      return "font-medium text-red-800 dark:text-red-200";
    case "green":
      return "font-medium text-emerald-800 dark:text-emerald-200";
    case "amber":
      return "font-medium text-amber-900 dark:text-amber-200";
  }
}

function SeriesExpandChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden
      className={`h-4 w-4 shrink-0 text-splice-ocean transition-transform dark:text-splice-water ${expanded ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function ClubSeriesEntriesList({ groupId, clubName, embedded, series, boats, profile }: Props) {
  const seriesIds = useMemo(() => series.map((s) => s.id), [series]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryStep, setEntryStep] = useState<EntryStep>("boats");
  const [selBoats, setSelBoats] = useState<Set<string>>(new Set());
  const [confirmContact, setConfirmContact] = useState(false);
  const [disclaimer, setDisclaimer] = useState(false);
  const [expandedSeriesIds, setExpandedSeriesIds] = useState<Set<string>>(() => new Set());
  const [withdrawBoatTarget, setWithdrawBoatTarget] = useState<WithdrawBoatTarget | null>(null);
  const [withdrawBoatConfirmed, setWithdrawBoatConfirmed] = useState(false);

  const boatsOwnedCount = boats.length;

  const allSeriesSelected = seriesIds.length > 0 && seriesIds.every((id) => selectedIds.has(id));

  function toggleSeries(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleSelectAllSeries(checked: boolean) {
    if (checked) setSelectedIds(new Set(seriesIds));
    else setSelectedIds(new Set());
  }

  function toggleSeriesExpanded(id: string) {
    setExpandedSeriesIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleBoat(id: string) {
    setSelBoats((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function openEntryFlow() {
    if (selectedIds.size === 0) return;
    setEntryOpen(true);
    setEntryStep("boats");
    const extending = [...selectedIds].some((sid) => series.find((s) => s.id === sid)?.isRegistered);
    if (extending) {
      setSelBoats(new Set());
    } else if (boats[0]?.id) {
      setSelBoats(new Set([boats[0].id]));
    } else {
      setSelBoats(new Set());
    }
    setConfirmContact(false);
    setDisclaimer(false);
  }

  const selectedSeriesRows = useMemo(
    () => series.filter((s) => selectedIds.has(s.id)),
    [series, selectedIds],
  );

  function closeEntryFlow() {
    setEntryOpen(false);
  }

  function openWithdrawBoatDialog(target: WithdrawBoatTarget) {
    setWithdrawBoatTarget(target);
    setWithdrawBoatConfirmed(false);
  }

  function closeWithdrawBoatDialog() {
    setWithdrawBoatTarget(null);
    setWithdrawBoatConfirmed(false);
  }

  const canContinueBoats = selBoats.size > 0;

  return (
    <section
      id={embedded ? `club-${groupId}` : "series-entries"}
      className="mt-2 scroll-mt-4 rounded-xl border border-splice-sky bg-white p-6 dark:border-splice-navy-light dark:bg-splice-navy"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">
          {embedded && clubName ? clubName : "Series schedule &amp; entries"}
        </h2>
        {!embedded ? (
          <p className="mt-2 text-xs text-splice-blue dark:text-splice-water">
            Each series shows its date range and how many of your boats are entered. Expand a row to manage boats, open
            standings, or withdraw. Select series below to attach boats, then confirm.
          </p>
        ) : null}
      </div>

      {!series.length ? (
        <p className="mt-4 text-sm text-splice-ocean dark:text-splice-water">
          No series at this venue yet. When organisers publish schedules, they appear here automatically.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={openEntryFlow}
              disabled={selectedIds.size === 0}
              className="inline-flex justify-center rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-splice-water dark:bg-splice-foam dark:text-splice-navy dark:disabled:bg-splice-ocean"
            >
              Enter selected series
            </button>
            <p className="text-xs text-splice-blue dark:text-splice-water">
              Need a boat first?{" "}
              <Link href="/fleet" className="font-medium text-splice-blue underline dark:text-splice-water">
                My boats
              </Link>
            </p>
          </div>

          <ul className="mt-4 divide-y divide-splice-foam rounded-lg border border-splice-foam dark:divide-splice-navy-light dark:border-splice-navy-light">
            <li className="flex items-center gap-3 bg-splice-surface px-3 py-2 dark:bg-splice-navy/50">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-splice-ocean dark:text-splice-water">
                <input
                  type="checkbox"
                  className="splice-checkbox"
                  checked={allSeriesSelected}
                  onChange={(e) => toggleSelectAllSeries(e.target.checked)}
                />
                Select all ({series.length})
              </label>
            </li>
            {series.map((s) => {
              const expanded = expandedSeriesIds.has(s.id);
              const boatsEnteredCount = s.boatEntries.length;
              const entryHighlight = seriesBoatEntryHighlight(boatsEnteredCount, boatsOwnedCount);

              return (
              <li
                key={s.id}
                className={`flex flex-col gap-3 px-3 py-3 ${embedded ? seriesBoatEntryHighlightClasses(entryHighlight) : ""}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggleSeries(s.id)}
                      className="splice-checkbox mt-1 shrink-0"
                      aria-label={`Select ${s.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start gap-2">
                        <button
                          type="button"
                          onClick={() => toggleSeriesExpanded(s.id)}
                          aria-expanded={expanded}
                          aria-controls={`series-entry-panel-${s.id}`}
                          className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg text-left hover:bg-splice-surface/80 dark:hover:bg-splice-navy-light/30"
                        >
                          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="min-w-0 truncate font-medium text-splice-navy dark:text-splice-foam">
                              {s.name}
                            </span>
                            <span
                              className={`shrink-0 text-xs whitespace-nowrap ${
                                embedded
                                  ? seriesBoatEntrySummaryClasses(entryHighlight)
                                  : "text-splice-ocean dark:text-splice-water"
                              }`}
                            >
                              {boatsEnteredSummary(boatsEnteredCount, boatsOwnedCount)}
                            </span>
                          </span>
                          <span className="text-xs text-splice-blue dark:text-splice-water">{s.dateLabel}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleSeriesExpanded(s.id)}
                          aria-expanded={expanded}
                          aria-controls={`series-entry-panel-${s.id}`}
                          aria-label={expanded ? `Minimise ${s.name}` : `Expand ${s.name}`}
                          className="shrink-0 rounded p-1 hover:bg-splice-surface dark:hover:bg-splice-navy-light/50"
                        >
                          <SeriesExpandChevron expanded={expanded} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-7 sm:pl-0">
                    <Link
                      href={`/groups/${groupId}/series/${s.id}/races`}
                      className="inline-flex justify-center rounded-lg border border-splice-water px-3 py-1.5 text-xs font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
                    >
                      Race list
                    </Link>
                    {expanded && s.isRegistered && s.boatEntries.length > 0 ? (
                      <form action={withdrawSeriesRegistrationAction} className="inline">
                        <input type="hidden" name="group_id" value={groupId} />
                        <input type="hidden" name="series_id" value={s.id} />
                        <button
                          type="submit"
                          title="Remove all boat entries and race rows for this series"
                          className="rounded-lg border border-splice-sky px-3 py-1.5 text-[11px] font-medium text-splice-ocean dark:border-splice-ocean dark:text-splice-water"
                        >
                          Withdraw all boats
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
                {expanded ? (
                <div id={`series-entry-panel-${s.id}`} className="flex flex-col gap-3">
                  <div className="ml-7 min-w-0 sm:ml-11">
                    {s.isRegistered && !s.boatEntries.length ? (
                      <p className="text-xs text-amber-900 dark:text-amber-200">
                        Signed up — add at least one boat using{" "}
                        <span className="font-medium">Enter selected series</span> above.
                      </p>
                    ) : null}
                  </div>
                {s.boatEntries.length > 0 ? (
                  <ul className="ml-7 space-y-2 border-l border-splice-sky py-1 pl-4 dark:border-splice-ocean sm:ml-11">
                    {s.boatEntries.map((b) => (
                      <li key={b.boatId} className="rounded-lg bg-splice-surface px-3 py-2 dark:bg-splice-navy/60">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-100">
                              Series boat entry
                            </span>
                            <p className="mt-1 text-sm font-semibold text-splice-navy dark:text-splice-foam">{b.boatLabel}</p>
                            {b.clubFleetName != null && String(b.clubFleetName).length ? (
                              <p className="mt-1 text-xs text-splice-ocean dark:text-splice-water">
                                <span className="font-medium text-splice-ocean dark:text-splice-water">Club fleet:</span>{" "}
                                {b.clubFleetName}
                              </p>
                            ) : null}
                            {b.nextFleetStartLine != null && String(b.nextFleetStartLine).length ? (
                              <p className="mt-1 text-xs text-splice-ocean dark:text-splice-water">
                                <span className="font-medium text-splice-ocean dark:text-splice-water">
                                  Next fleet start (this boat):
                                </span>{" "}
                                {b.nextFleetStartLine}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <Link
                              href={`/groups/${groupId}/series/${s.id}/standings`}
                              className="rounded-lg border border-splice-water px-2 py-1 text-[11px] font-medium text-splice-navy-light dark:border-splice-ocean dark:text-splice-sky"
                            >
                              Standing
                            </Link>
                            <button
                              type="button"
                              onClick={() =>
                                openWithdrawBoatDialog({
                                  seriesId: s.id,
                                  seriesName: s.name,
                                  boatId: b.boatId,
                                  boatLabel: b.boatLabel,
                                })
                              }
                              className="rounded-lg border border-splice-water px-2 py-1 text-[11px] font-medium text-splice-navy-light dark:border-splice-ocean dark:text-splice-sky"
                            >
                              Withdraw
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                </div>
                ) : null}
              </li>
              );
            })}
          </ul>
        </>
      )}

      {entryOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="presentation"
          onClick={closeEntryFlow}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-splice-sky bg-white p-6 shadow-lg dark:border-splice-ocean dark:bg-splice-navy"
            role="dialog"
            aria-modal="true"
            aria-labelledby="series-entry-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="series-entry-dialog-title" className="text-lg font-semibold text-splice-navy dark:text-splice-surface">
              {entryStep === "boats"
                ? "Boats for this entry"
                : entryStep === "contact"
                  ? "Confirm contact details"
                  : "Disclaimer"}
            </h3>
            <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
              Entering {selectedIds.size} series
              {selectedIds.size === 1 ? "" : "s"} for this club.
            </p>
            {selectedSeriesRows.some((r) => r.isRegistered) ? (
              <p className="mt-2 rounded-lg bg-splice-foam px-3 py-2 text-xs text-splice-ocean dark:bg-splice-navy-light/90 dark:text-splice-water">
                You already sail at least one chosen series — any boat you tick is merged into your signup; duplicates are skipped.
              </p>
            ) : null}

            {entryStep === "boats" ? (
              <>
                {boats.length === 0 ? (
                  <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">
                    Add a boat under{" "}
                    <Link href="/fleet" className="font-medium underline" onClick={closeEntryFlow}>
                      My boats
                    </Link>{" "}
                    first, then continue here.
                  </p>
                ) : (
                  <>
                    {selectedSeriesRows.some((r) => r.isRegistered) ? (
                      <p className="mt-4 text-xs text-splice-blue dark:text-splice-water">
                        Boats already on your signup for the selected series remain; tick any extra boat — duplicates are skipped server-side.
                      </p>
                    ) : null}
                    <ul className="mt-4 max-h-48 divide-y divide-splice-foam overflow-y-auto rounded-lg border border-splice-foam dark:divide-splice-navy-light dark:border-splice-navy-light">
                      {boats.map((b) => {
                        const onSignupForSeries = selectedSeriesRows.filter((row) =>
                          row.enteredBoatIds.includes(b.id),
                        );
                        const onSignupSuffix =
                          onSignupForSeries.length > 0
                            ? ` — already on signup: ${onSignupForSeries.map((r) => r.name).join(", ")}`
                            : "";

                        return (
                          <li key={b.id}>
                            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-splice-surface dark:hover:bg-splice-navy-light/50">
                              <input
                                type="checkbox"
                                className="splice-checkbox"
                                checked={selBoats.has(b.id)}
                                onChange={() => toggleBoat(b.id)}
                              />
                              <span className="font-medium text-splice-navy dark:text-splice-foam">
                                {formatBoatEntryLabel({
                                  defaultSailNumber: b.default_sail_number,
                                  className: b.class_name,
                                  ryaClassKey: b.rya_class_key,
                                  label: b.label,
                                })}
                                {onSignupSuffix ? (
                                  <span className="text-splice-blue dark:text-splice-water">{onSignupSuffix}</span>
                                ) : null}
                                {!b.rya_class_key ? (
                                  <span className="text-amber-700 dark:text-amber-400">
                                    {" "}
                                    — set RYA class on the boat record
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-4 text-xs text-splice-blue">
                      <Link href="/fleet" className="text-splice-blue underline dark:text-splice-water">
                        Create another boat
                      </Link>
                    </p>
                  </>
                )}
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeEntryFlow}
                    className="rounded-lg border border-splice-water px-4 py-2 text-sm font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!canContinueBoats}
                    onClick={() => setEntryStep("contact")}
                    className="rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-splice-water dark:bg-splice-foam dark:text-splice-navy dark:disabled:bg-splice-ocean"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : null}

            {entryStep === "contact" ? (
              <>
                <div className="mt-4 rounded-lg border border-splice-foam bg-splice-surface p-4 dark:border-splice-navy-light dark:bg-splice-navy/80">
                  <p className="text-sm text-splice-ocean dark:text-splice-water">
                    Signed-in account: <strong>{profile.email ?? "—"}</strong>
                    {profile.display_name ? (
                      <>
                        {" "}
                        · display name <strong>{profile.display_name}</strong>
                      </>
                    ) : null}
                    {profile.phone ? (
                      <>
                        {" "}
                        · phone <strong>{profile.phone}</strong>
                      </>
                    ) : (
                      <>
                        {" "}
                        · no phone on file — add one under{" "}
                        <Link
                          href="/account"
                          title="Your profile & account settings"
                          className="text-splice-blue underline dark:text-splice-water"
                        >
                          {profile.display_name?.trim() || profile.email || "your account"}
                        </Link>
                      </>
                    )}
                  </p>
                  <label className="mt-4 flex items-start gap-2 text-sm text-splice-navy-light dark:text-splice-sky">
                    <input
                      type="checkbox"
                      className="splice-checkbox"
                      checked={confirmContact}
                      onChange={(e) => setConfirmContact(e.target.checked)}
                    />
                    I confirm these contact details are current for organisers to reach me.
                  </label>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEntryStep("boats")}
                    className="rounded-lg border border-splice-water px-4 py-2 text-sm dark:border-splice-ocean"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!confirmContact}
                    onClick={() => setEntryStep("disclaimer")}
                    className="rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-splice-water dark:bg-splice-foam dark:text-splice-navy dark:disabled:bg-splice-ocean"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : null}

            {entryStep === "disclaimer" ? (
              <form action={enterSeriesBulkAction} className="mt-4">
                <input type="hidden" name="enter_series_source" value="club" />
                <input type="hidden" name="club_return_group_id" value={groupId} />
                <input type="hidden" name="disclaimer_accepted" value={disclaimer ? "1" : "0"} />
                <input type="hidden" name="contact_confirmed" value={confirmContact ? "1" : "0"} />
                <input type="hidden" name="groups_all" value="0" />
                <input type="hidden" name="series_all" value="0" />
                <input type="hidden" name="boats_all" value="0" />
                <input type="hidden" name="group_id" value={groupId} />
                {[...selectedIds].map((sid) => (
                  <input key={sid} type="hidden" name="series_id" value={sid} />
                ))}
                {[...selBoats].map((bid) => (
                  <input key={bid} type="hidden" name="boat_id" value={bid} />
                ))}

                <p className="text-sm text-splice-ocean dark:text-splice-water">
                  By entering you agree to organise club and class rules published by each venue, sailing at your own risk,
                  and that handicap data follows the catalogue and club settings (race officers publish results — you cannot
                  set your own Portsmouth override).
                </p>
                <label className="mt-4 flex items-start gap-2 text-sm text-splice-navy-light dark:text-splice-sky">
                  <input
                    type="checkbox"
                    className="splice-checkbox"
                    checked={disclaimer}
                    onChange={(e) => setDisclaimer(e.target.checked)}
                  />
                  I agree
                </label>

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEntryStep("contact")}
                    className="rounded-lg border border-splice-water px-4 py-2 text-sm dark:border-splice-ocean"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={!disclaimer || !confirmContact}
                    className="rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-splice-water dark:bg-splice-foam dark:text-splice-navy dark:disabled:bg-splice-ocean"
                  >
                    Confirm entry
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      {withdrawBoatTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="presentation"
          onClick={closeWithdrawBoatDialog}
        >
          <div
            className="w-full max-w-md rounded-xl border border-splice-sky bg-white p-6 shadow-lg dark:border-splice-ocean dark:bg-splice-navy"
            role="dialog"
            aria-modal="true"
            aria-labelledby="withdraw-boat-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="withdraw-boat-dialog-title" className="text-lg font-semibold text-splice-navy dark:text-splice-surface">
              Withdraw boat
            </h3>
            <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
              Remove{" "}
              <span className="font-medium text-splice-navy dark:text-splice-foam">{withdrawBoatTarget.boatLabel}</span> from{" "}
              <span className="font-medium text-splice-navy dark:text-splice-foam">{withdrawBoatTarget.seriesName}</span>?
              Race entries for this boat in the series will be cleared. If this is your only boat on the signup, you leave
              the series entirely.
            </p>
            <form key={withdrawBoatTarget.boatId} action={withdrawSeriesHullAction} className="mt-5">
              <input type="hidden" name="group_id" value={groupId} />
              <input type="hidden" name="series_id" value={withdrawBoatTarget.seriesId} />
              <input type="hidden" name="boat_id" value={withdrawBoatTarget.boatId} />
              <label className="flex items-start gap-2 text-sm text-splice-navy-light dark:text-splice-sky">
                <input
                  type="checkbox"
                  className="splice-checkbox"
                  checked={withdrawBoatConfirmed}
                  onChange={(e) => setWithdrawBoatConfirmed(e.target.checked)}
                />
                I want to withdraw this boat from the series
              </label>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeWithdrawBoatDialog}
                  className="rounded-lg border border-splice-water px-4 py-2 text-sm font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!withdrawBoatConfirmed}
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200"
                >
                  Withdraw boat
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
