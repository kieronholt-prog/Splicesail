"use client";

import { useMemo, useState } from "react";

/** One row from `boat_classes` (national or club catalogue) for picker display. */
export type BoatClassCatalogOption = {
  class_key: string;
  display_name: string;
};

const MAX_FILTER_RESULTS = 80;

/** Filterable boat-class picker (catalogue keys + labels). Hidden form fields supplied by parent. */
export function ClubGuestBoatClassPicker(props: {
  options: BoatClassCatalogOption[];
  valueKey: string;
  valueDisplay: string;
  onSelect: (class_key: string, display_name: string) => void;
  onClear: () => void;
}) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const rows = props.options;
    const q = filter.trim().toLowerCase();
    if (!q) return rows.slice(0, MAX_FILTER_RESULTS);
    return rows
      .filter(
        (r) =>
          r.display_name.toLowerCase().includes(q) || r.class_key.toLowerCase().includes(q),
      )
      .slice(0, MAX_FILTER_RESULTS);
  }, [props.options, filter]);

  const hasSelection = Boolean(props.valueKey.trim());

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-medium text-splice-ocean dark:text-splice-water">
        Boat class <span className="text-red-600 dark:text-red-400">*</span>
      </span>
      {hasSelection ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-splice-water bg-splice-surface px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy">
          <span className="min-w-0 flex-1 text-splice-navy dark:text-splice-foam">{props.valueDisplay}</span>
          <span className="shrink-0 font-mono text-[11px] text-splice-blue dark:text-splice-water">{props.valueKey}</span>
          <button
            type="button"
            className="shrink-0 rounded-md border border-splice-water bg-white px-2 py-1 text-[11px] font-medium text-splice-navy-light dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-sky"
            onClick={() => {
              props.onClear();
              setFilter("");
            }}
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Type to filter classes…"
            autoComplete="off"
            aria-label="Filter boat classes"
            className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
          />
          {props.options.length === 0 ? (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              No boat classes in the catalogue yet — add national or club classes first.
            </p>
          ) : filter.trim().length === 0 ? (
            <p className="text-[11px] text-splice-blue dark:text-splice-water">
              Start typing to narrow the list, then pick a class.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-[11px] text-splice-blue dark:text-splice-water">No matching classes.</p>
          ) : (
            <ul
              aria-label="Boat classes matching filter"
              className="max-h-44 overflow-y-auto rounded-lg border border-splice-sky bg-white dark:border-splice-ocean dark:bg-splice-navy"
            >
              {filtered.map((r) => (
                <li key={r.class_key}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 border-b border-splice-foam px-2 py-2 text-left text-sm last:border-b-0 hover:bg-splice-surface dark:border-splice-navy-light dark:hover:bg-splice-navy"
                    onClick={() => {
                      props.onSelect(r.class_key, r.display_name);
                      setFilter("");
                    }}
                  >
                    <span className="font-medium text-splice-navy dark:text-splice-foam">{r.display_name}</span>
                    <span className="font-mono text-[10px] text-splice-blue dark:text-splice-water">{r.class_key}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
