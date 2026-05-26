"use client";

import { useMemo, useState, useTransition } from "react";
import {
  delinkSailorResultsAction,
  searchDelinkableSailorResultsAction,
} from "@/app/actions/delink-sailor-results";
import type { DelinkBoatClassOption, DelinkableResultRowVm } from "@/lib/delink-sailor-results";
import {
  formatClubDateTimeMediumShort,
  formatClubDdMmmYyyyFromIso,
  formatClubHmFromIso,
} from "@/lib/club-display-format";

type Props = {
  groupId: string;
  clubTz: string;
  classOptions: DelinkBoatClassOption[];
  initialSailNumber: string;
  initialClassKey: string;
  initialRows: DelinkableResultRowVm[];
};

export function DelinkSailorResultsPanel({
  groupId,
  clubTz,
  classOptions,
  initialSailNumber,
  initialClassKey,
  initialRows,
}: Props) {
  const [sailNumber, setSailNumber] = useState(initialSailNumber);
  const [classKey, setClassKey] = useState(initialClassKey);
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [hasSearched, setHasSearched] = useState(Boolean(initialSailNumber && initialClassKey));
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isDelinking, startDelink] = useTransition();

  const allSelected = rows.length > 0 && selected.size === rows.length;

  const selectedCount = selected.size;

  const positionLabel = useMemo(() => {
    return (row: DelinkableResultRowVm) =>
      row.finishPosition != null ? String(row.finishPosition) : "—";
  }, []);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (rows.length === 0) return prev;
      if (prev.size === rows.length) return new Set();
      return new Set(rows.map((r) => r.raceEntryId));
    });
  }

  function runSearch() {
    setSearchError(null);
    startSearch(async () => {
      const fd = new FormData();
      fd.set("group_id", groupId);
      fd.set("sail_number", sailNumber);
      fd.set("class_key", classKey);
      try {
        const result = await searchDelinkableSailorResultsAction(fd);
        setRows(result.rows);
        setSelected(new Set());
        setHasSearched(true);
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : "Search failed.");
      }
    });
  }

  function runDelink() {
    startDelink(async () => {
      const fd = new FormData();
      fd.set("group_id", groupId);
      fd.set("sail_number", sailNumber);
      fd.set("class_key", classKey);
      for (const id of selected) {
        fd.append("race_entry_id", id);
      }
      await delinkSailorResultsAction(fd);
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-splice-sky bg-white px-5 py-4 dark:border-splice-ocean dark:bg-splice-navy/40">
        <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">Search results</h2>
        <p className="mt-2 text-xs text-splice-ocean dark:text-splice-water">
          Find sailor-linked race results by sail number and boat class. De-linking moves each selected finish back to a
          race-only RO-added row so the hull can be removed from the sailor&apos;s fleet once every result is restored.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
            Sail number
            <input
              name="sail_number"
              value={sailNumber}
              onChange={(e) => setSailNumber(e.target.value)}
              placeholder="e.g. 123456"
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
            Boat type
            <select
              name="class_key"
              value={classKey}
              onChange={(e) => setClassKey(e.target.value)}
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-sm text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            >
              <option value="">Select class…</option>
              {classOptions.map((opt) => (
                <option key={opt.classKey} value={opt.classKey}>
                  {opt.displayName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={runSearch}
            disabled={isSearching || !sailNumber.trim() || !classKey}
            className="rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-splice-foam dark:text-splice-navy"
          >
            {isSearching ? "Searching…" : "Search"}
          </button>
        </div>
        {searchError ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200" role="alert">
            {searchError}
          </p>
        ) : null}
      </section>

      {rows.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-splice-sky bg-white dark:border-splice-ocean dark:bg-splice-navy">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-splice-sky px-4 py-3 dark:border-splice-ocean">
            <p className="text-sm font-medium text-splice-navy dark:text-splice-surface">
              {rows.length} result{rows.length === 1 ? "" : "s"} found
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleAll}
                className="rounded-lg border border-splice-water px-3 py-1.5 text-xs font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-sky"
              >
                {allSelected ? "Clear selection" : "Select all"}
              </button>
              <button
                type="button"
                onClick={runDelink}
                disabled={isDelinking || selectedCount === 0}
                className="rounded-lg bg-amber-700 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-amber-600"
              >
                {isDelinking ? "De-linking…" : `De-link${selectedCount ? ` (${selectedCount})` : ""}`}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-ocean dark:bg-splice-navy-light/40">
                <tr>
                  <th className="px-4 py-3 font-medium text-splice-navy dark:text-splice-surface">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-4 py-3 font-medium text-splice-navy dark:text-splice-surface">Series / race</th>
                  <th className="px-4 py-3 font-medium text-splice-navy dark:text-splice-surface">Sailor</th>
                  <th className="px-4 py-3 font-medium text-splice-navy dark:text-splice-surface">Position</th>
                  <th className="px-4 py-3 font-medium text-splice-navy dark:text-splice-surface">Finish</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-splice-sky dark:divide-splice-ocean">
                {rows.map((row) => (
                  <tr key={row.raceEntryId}>
                    <td className="px-4 py-3 align-top">
                      <input
                        type="checkbox"
                        checked={selected.has(row.raceEntryId)}
                        onChange={() => toggleOne(row.raceEntryId)}
                        aria-label={`Select ${row.seriesName} ${row.raceName}`}
                        className="size-4 rounded border-splice-water text-splice-navy"
                      />
                    </td>
                    <td className="px-4 py-3 align-top text-splice-navy dark:text-splice-foam">
                      <p className="font-medium">{row.seriesName}</p>
                      <p className="mt-0.5 text-xs text-splice-ocean dark:text-splice-water">{row.raceName}</p>
                      <p className="mt-0.5 text-xs tabular-nums text-splice-blue dark:text-splice-water">
                        {formatClubDdMmmYyyyFromIso(row.raceScheduledAt, clubTz)}
                        {row.raceScheduledAt ? ` · ${formatClubHmFromIso(row.raceScheduledAt, clubTz)}` : null}
                      </p>
                      {row.hasConfirmedLink ? (
                        <p className="mt-1 text-[11px] font-medium text-amber-800 dark:text-amber-200">Linked from RO-added</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top text-splice-navy dark:text-splice-foam">
                      <p className="font-medium">{row.sailorDisplayName}</p>
                      <p className="mt-0.5 text-xs text-splice-ocean dark:text-splice-water">{row.boatLabel}</p>
                    </td>
                    <td className="px-4 py-3 align-top tabular-nums text-splice-navy dark:text-splice-foam">
                      {positionLabel(row)}
                    </td>
                    <td className="px-4 py-3 align-top tabular-nums text-splice-ocean dark:text-splice-water">
                      {formatClubDateTimeMediumShort(row.finishAt, clubTz)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : hasSearched ? (
        <p className="rounded-lg border border-dashed border-splice-sky px-4 py-6 text-center text-sm text-splice-ocean dark:border-splice-ocean dark:text-splice-water">
          No sailor-linked finishes match that sail number and boat type.
        </p>
      ) : null}
    </div>
  );
}
