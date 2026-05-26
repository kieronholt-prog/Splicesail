"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type RoBadgeFleetOption = { id: string; name: string };

export type RoBadgeFilterable = {
  id: string;
  sailDisplay: string;
  boatTypeLabel: string;
  helmName?: string;
  fleetId: string | null;
};

export type RoBadgeSearchNav = {
  /** Entry id to visually highlight when search has multiple matches. */
  highlightId: string | null;
};

export type RoBadgeFilterState = {
  filtersActive: boolean;
};

function normalizeSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

function entryMatchesSearch(e: RoBadgeFilterable, query: string) {
  const q = normalizeSearchQuery(query);
  if (!q) return true;
  const qSail = q.replace(/\s+/g, "");
  const sail = e.sailDisplay.replace(/\s+/g, "").toLowerCase();
  const boat = e.boatTypeLabel.toLowerCase();
  const helm = (e.helmName ?? "").toLowerCase();
  return sail.includes(qSail) || boat.includes(q) || helm.includes(q);
}

export function roBadgeFilterButtonClass(active: boolean, menuOpen: boolean) {
  const base =
    "rounded-lg border px-3 py-2 text-left text-xs font-medium shadow-sm transition min-h-[44px] min-w-[5.5rem]";
  if (active || menuOpen) {
    return `${base} border-splice-blue bg-splice-foam text-splice-navy dark:border-splice-water/60 dark:bg-splice-navy-light/40 dark:text-splice-foam`;
  }
  return `${base} border-splice-water bg-white text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam`;
}

type Props = {
  fleets: RoBadgeFleetOption[];
  filterables: RoBadgeFilterable[];
  /** When set, Enter on a highlighted search match invokes this (e.g. open finish edit dialog). */
  onSearchEnter?: (entryId: string) => void;
  children: (
    filteredIds: ReadonlySet<string>,
    searchNav: RoBadgeSearchNav,
    filterState: RoBadgeFilterState,
  ) => React.ReactNode;
};

/**
 * Boat type, fleet, sail-number pad, and text search — shared by Record finishes and Sailors (start line).
 * Search live-filters helm, class, and sail; ↑↓ highlights matches; optional Enter opens finish edit.
 */
export function RoBadgeQuickFilters({ fleets, filterables, children, onSearchEnter }: Props) {
  const [boatTypeFilter, setBoatTypeFilter] = useState<string | null>(null);
  const [fleetFilterId, setFleetFilterId] = useState<string | null>(null);
  const [sailDigits, setSailDigits] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHighlightIndex, setSearchHighlightIndex] = useState(0);
  const [boatTypeMenuOpen, setBoatTypeMenuOpen] = useState(false);
  const [fleetMenuOpen, setFleetMenuOpen] = useState(false);
  const [sailPadOpen, setSailPadOpen] = useState(false);

  const boatTypeWrapRef = useRef<HTMLDivElement>(null);
  const fleetWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const boatTypes = useMemo(() => {
    const set = new Set<string>();
    for (const e of filterables) {
      const t = e.boatTypeLabel.trim();
      if (t && t !== "—") set.add(t);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [filterables]);

  useEffect(() => {
    if (!boatTypeMenuOpen && !fleetMenuOpen) return;
    function onDocMouseDown(ev: MouseEvent) {
      const t = ev.target as Node;
      if (boatTypeMenuOpen && boatTypeWrapRef.current && !boatTypeWrapRef.current.contains(t)) {
        setBoatTypeMenuOpen(false);
      }
      if (fleetMenuOpen && fleetWrapRef.current && !fleetWrapRef.current.contains(t)) {
        setFleetMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [boatTypeMenuOpen, fleetMenuOpen]);

  const filteredIds = useMemo(() => {
    const sailNorm = sailDigits.replace(/\s+/g, "").toLowerCase();
    const set = new Set<string>();
    for (const e of filterables) {
      if (boatTypeFilter && e.boatTypeLabel !== boatTypeFilter) continue;
      if (fleetFilterId && e.fleetId !== fleetFilterId) continue;
      if (sailNorm) {
        const disp = e.sailDisplay.replace(/\s+/g, "").toLowerCase();
        if (!disp.includes(sailNorm)) continue;
      }
      if (!entryMatchesSearch(e, searchQuery)) continue;
      set.add(e.id);
    }
    return set;
  }, [filterables, boatTypeFilter, fleetFilterId, sailDigits, searchQuery]);

  const searchOrderedIds = useMemo(() => {
    if (!normalizeSearchQuery(searchQuery)) return [];
    const ids: string[] = [];
    for (const e of filterables) {
      if (filteredIds.has(e.id)) ids.push(e.id);
    }
    return ids;
  }, [filterables, filteredIds, searchQuery]);

  const searchActive = normalizeSearchQuery(searchQuery).length > 0;

  const filtersActive =
    boatTypeFilter != null ||
    fleetFilterId != null ||
    sailDigits.length > 0 ||
    searchActive;

  const highlightId = useMemo(() => {
    if (!searchActive || !searchOrderedIds.length) return null;
    const idx = Math.min(searchHighlightIndex, searchOrderedIds.length - 1);
    return searchOrderedIds[Math.max(0, idx)] ?? null;
  }, [searchActive, searchOrderedIds, searchHighlightIndex]);

  useEffect(() => {
    setSearchHighlightIndex(0);
  }, [searchQuery, searchOrderedIds.length]);

  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`ro-badge-${highlightId}`)?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [highlightId]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!searchActive) return;
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp" && ev.key !== "Enter") return;
      const target = ev.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") &&
        target !== searchInputRef.current
      ) {
        return;
      }
      if (!searchOrderedIds.length) return;

      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        setSearchHighlightIndex((i) => (i + 1) % searchOrderedIds.length);
        return;
      }
      if (ev.key === "ArrowUp") {
        ev.preventDefault();
        setSearchHighlightIndex((i) => (i - 1 + searchOrderedIds.length) % searchOrderedIds.length);
        return;
      }
      if (ev.key === "Enter" && highlightId && onSearchEnter) {
        ev.preventDefault();
        onSearchEnter(highlightId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchActive, searchOrderedIds, highlightId, onSearchEnter]);

  const onBoatTypeButtonClick = useCallback(() => {
    if (boatTypeFilter != null) {
      setBoatTypeFilter(null);
      setBoatTypeMenuOpen(false);
      return;
    }
    setBoatTypeMenuOpen((o) => !o);
    setFleetMenuOpen(false);
  }, [boatTypeFilter]);

  const onFleetButtonClick = useCallback(() => {
    if (fleetFilterId != null) {
      setFleetFilterId(null);
      setFleetMenuOpen(false);
      return;
    }
    setFleetMenuOpen((o) => !o);
    setBoatTypeMenuOpen(false);
  }, [fleetFilterId]);

  return (
    <div className="space-y-3">
      <div className="relative z-50 flex flex-wrap gap-2">
        <div ref={boatTypeWrapRef} className="relative">
          <button
            type="button"
            className={roBadgeFilterButtonClass(boatTypeFilter != null, boatTypeMenuOpen)}
            onClick={onBoatTypeButtonClick}
            aria-expanded={boatTypeMenuOpen}
          >
            {boatTypeFilter ? (
              <span>
                Boat type · <span className="font-semibold">{boatTypeFilter}</span>
                <span className="mt-0.5 block text-[10px] font-normal text-splice-blue dark:text-splice-water">
                  Tap to clear
                </span>
              </span>
            ) : (
              <span>
                Boat type
                <span className="mt-0.5 block text-[10px] font-normal text-splice-blue dark:text-splice-water">
                  Choose class
                </span>
              </span>
            )}
          </button>
          {boatTypeMenuOpen ? (
            boatTypes.length ? (
              <ul
                className="absolute left-0 top-full z-[200] mt-1 max-h-60 min-w-[12rem] overflow-auto rounded-lg border border-splice-sky bg-white py-1 shadow-lg dark:border-splice-ocean dark:bg-splice-navy"
                role="listbox"
              >
                {boatTypes.map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-xs text-splice-navy hover:bg-splice-foam dark:text-splice-foam dark:hover:bg-splice-navy-light"
                      onClick={() => {
                        setBoatTypeFilter(t);
                        setBoatTypeMenuOpen(false);
                      }}
                    >
                      {t}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="absolute left-0 top-full z-[200] mt-1 min-w-[12rem] rounded-lg border border-splice-sky bg-white px-3 py-2 text-xs text-splice-ocean shadow-lg dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-water">
                No boat class data on entries.
              </p>
            )
          ) : null}
        </div>

        <div ref={fleetWrapRef} className="relative">
          <button
            type="button"
            className={roBadgeFilterButtonClass(fleetFilterId != null, fleetMenuOpen)}
            onClick={onFleetButtonClick}
            aria-expanded={fleetMenuOpen}
            disabled={!fleets.length}
          >
            {fleetFilterId ? (
              <span>
                Fleet ·{" "}
                <span className="font-semibold">
                  {fleets.find((f) => f.id === fleetFilterId)?.name ?? "—"}
                </span>
                <span className="mt-0.5 block text-[10px] font-normal text-splice-blue dark:text-splice-water">
                  Tap to clear
                </span>
              </span>
            ) : (
              <span>
                Fleet
                <span className="mt-0.5 block text-[10px] font-normal text-splice-blue dark:text-splice-water">
                  Choose fleet
                </span>
              </span>
            )}
          </button>
          {fleetMenuOpen && fleets.length ? (
            <ul className="absolute left-0 top-full z-[200] mt-1 max-h-60 min-w-[12rem] overflow-auto rounded-lg border border-splice-sky bg-white py-1 shadow-lg dark:border-splice-ocean dark:bg-splice-navy">
              {fleets.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-xs text-splice-navy hover:bg-splice-foam dark:text-splice-foam dark:hover:bg-splice-navy-light"
                    onClick={() => {
                      setFleetFilterId(f.id);
                      setFleetMenuOpen(false);
                    }}
                  >
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <button
          type="button"
          className={roBadgeFilterButtonClass(sailDigits.length > 0, sailPadOpen)}
          onClick={() => {
            setSailPadOpen(true);
            setBoatTypeMenuOpen(false);
            setFleetMenuOpen(false);
            setSearchOpen(false);
          }}
        >
          Sail no.
          <span className="mt-0.5 block truncate font-mono text-[11px] font-semibold tabular-nums text-splice-ocean dark:text-splice-water">
            {sailDigits ? sailDigits : "Number pad"}
          </span>
        </button>

        <button
          type="button"
          className={roBadgeFilterButtonClass(searchActive, searchOpen)}
          onClick={() => {
            setSearchOpen((o) => !o);
            setBoatTypeMenuOpen(false);
            setFleetMenuOpen(false);
            setSailPadOpen(false);
          }}
          aria-expanded={searchOpen}
        >
          {searchActive ? (
            <span>
              Search · <span className="font-semibold">{normalizeSearchQuery(searchQuery)}</span>
              <span className="mt-0.5 block text-[10px] font-normal text-splice-blue dark:text-splice-water">
                Tap to {searchOpen ? "hide" : "show"}
              </span>
            </span>
          ) : (
            <span>
              Search
              <span className="mt-0.5 block text-[10px] font-normal text-splice-blue dark:text-splice-water">
                Helm · class · sail
              </span>
            </span>
          )}
        </button>
      </div>

      {searchOpen ? (
        <div>
          <label className="block">
            <span className="sr-only">Search boats by helm, class, or sail number</span>
            <input
              ref={searchInputRef}
              type="search"
              enterKeyHint="go"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Helm, boat class, or sail number…"
              value={searchQuery}
              onChange={(ev) => setSearchQuery(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Escape") {
                  ev.preventDefault();
                  if (searchQuery) setSearchQuery("");
                  else setSearchOpen(false);
                  return;
                }
                if (ev.key === "Enter" && highlightId && onSearchEnter) {
                  ev.preventDefault();
                  onSearchEnter(highlightId);
                }
              }}
              className="w-full rounded-lg border border-splice-water bg-white px-3 py-2.5 text-sm text-splice-navy shadow-sm placeholder:text-splice-water focus:border-splice-blue focus:outline-none focus:ring-2 focus:ring-splice-blue/30 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam dark:placeholder:text-splice-blue"
            />
          </label>
          {searchActive ? (
            <p className="mt-1.5 text-[11px] text-splice-blue dark:text-splice-water">
              {searchOrderedIds.length === 0 ? (
                "No boats match."
              ) : searchOrderedIds.length === 1 ? (
                "One match — press Enter to open entry."
              ) : (
                <>
                  {searchOrderedIds.length} matches — ↑↓ to highlight
                  {onSearchEnter ? ", Enter to open entry" : ""}
                </>
              )}
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-splice-blue dark:text-splice-water">
              Live filter across helm, class, and sail. Works with other filters.
            </p>
          )}
        </div>
      ) : null}

      {sailPadOpen ? (
        <div
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Sail number filter"
          onMouseDown={(ev) => {
            if (ev.target === ev.currentTarget) setSailPadOpen(false);
          }}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-splice-sky bg-white p-4 shadow-xl dark:border-splice-ocean dark:bg-splice-navy"
            onMouseDown={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-splice-ocean dark:text-splice-water">Sail number</p>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs font-medium text-splice-blue hover:bg-splice-foam dark:text-splice-water dark:hover:bg-splice-navy-light/50"
                onClick={() => setSailPadOpen(false)}
              >
                Done
              </button>
            </div>
            <div className="mt-3 min-h-[2.5rem] rounded-lg border border-splice-sky bg-splice-surface px-3 py-2 text-center font-mono text-lg font-semibold tabular-nums tracking-wide text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-surface">
              {sailDigits || "—"}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {(
                [
                  ["1", "2", "3"],
                  ["4", "5", "6"],
                  ["7", "8", "9"],
                ] as const
              ).map((row) => (
                <div key={row.join("")} className="grid grid-cols-3 gap-2">
                  {row.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="min-h-[48px] rounded-xl border border-splice-sky bg-splice-surface py-3 text-lg font-semibold text-splice-navy shadow-sm hover:bg-splice-foam dark:border-splice-ocean dark:bg-splice-navy-light dark:text-splice-foam dark:hover:bg-splice-ocean"
                      onClick={() => setSailDigits((s) => s + d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className="min-h-[48px] rounded-xl border border-splice-sky bg-splice-surface py-3 text-sm font-semibold text-splice-ocean shadow-sm hover:bg-splice-foam dark:border-splice-ocean dark:bg-splice-navy-light dark:text-splice-sky dark:hover:bg-splice-ocean"
                  onClick={() => setSailDigits((s) => s.slice(0, -1))}
                >
                  ⌫
                </button>
                <button
                  type="button"
                  className="min-h-[48px] rounded-xl border border-splice-sky bg-splice-surface py-3 text-lg font-semibold text-splice-navy shadow-sm hover:bg-splice-foam dark:border-splice-ocean dark:bg-splice-navy-light dark:text-splice-foam dark:hover:bg-splice-ocean"
                  onClick={() => setSailDigits((s) => s + "0")}
                >
                  0
                </button>
                <button
                  type="button"
                  className="min-h-[48px] rounded-xl border border-splice-sky bg-splice-surface py-3 text-xs font-semibold text-splice-ocean shadow-sm hover:bg-splice-foam dark:border-splice-ocean dark:bg-splice-navy-light dark:text-splice-sky dark:hover:bg-splice-ocean"
                  onClick={() => setSailDigits("")}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {children(filteredIds, { highlightId }, { filtersActive })}
    </div>
  );
}
