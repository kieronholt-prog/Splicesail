"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { deleteSailingMarkAction, saveSailingMarkAction } from "@/app/actions/club-sailing-area";
import { MarkEditMap, type EditPoint } from "@/components/sailing-analysis/mark-edit-map";
import { DEFAULT_MAP_CENTER, markBadgeLabel } from "@/lib/sailing-analysis/map-display";
import type { SailingMarkKind } from "@/lib/sailing-analysis/types";

export type SailingMarkVm = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  lat2: number | null;
  lon2: number | null;
  mark_kind: SailingMarkKind;
  description: string | null;
};

type EditTarget =
  | { mode: "create" }
  | { mode: "edit"; mark: SailingMarkVm };

const END_A_COLOR = "#00e5c5";
const END_B_COLOR = "#ffb84a";
const FIXED_COLOR = "#4a90d9";
const LAID_COLOR = "#e8b84a";

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(6) : "";
}

type MarkGroup = {
  key: string;
  label: string;
  filter: (m: SailingMarkVm) => boolean;
};

export const PILE_BUOY_RE = /pile|buoy|beacon|post|dolphin|channel|transit|perch/i;

const MARK_GROUPS: MarkGroup[] = [
  {
    key: "start_finish",
    label: "Start / Finish Lines",
    filter: (m) => m.mark_kind === "start_finish",
  },
  {
    key: "pile_buoy",
    label: "Pile / Buoy River Markers",
    filter: (m) => m.mark_kind === "fixed" && PILE_BUOY_RE.test(m.name),
  },
  {
    key: "named_fixed",
    label: "Named Fixed Marks",
    filter: (m) => m.mark_kind === "fixed" && !PILE_BUOY_RE.test(m.name),
  },
  {
    key: "laid",
    label: "Laid Marks",
    filter: (m) => m.mark_kind === "laid",
  },
];

function CollapsibleMarkGroup({
  group,
  groupMarks,
  groupId,
  onEdit,
}: {
  group: MarkGroup;
  groupMarks: SailingMarkVm[];
  groupId: string;
  onEdit: (m: SailingMarkVm) => void;
}) {
  const [open, setOpen] = useState(false);
  if (groupMarks.length === 0) return null;

  return (
    <div className="rounded-lg border border-splice-sky dark:border-splice-ocean">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm"
      >
        <span className="font-medium text-splice-navy dark:text-splice-foam">
          {group.label}
          <span className="ml-2 rounded-full bg-splice-sky px-2 py-0.5 text-xs font-normal text-splice-ocean dark:bg-splice-ocean/40 dark:text-splice-water">
            {groupMarks.length}
          </span>
        </span>
        <svg
          aria-hidden
          className={`h-4 w-4 shrink-0 text-splice-ocean transition-transform dark:text-splice-water ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <ul className="border-t border-splice-sky px-3 pb-3 pt-2 dark:border-splice-ocean space-y-1.5">
          {groupMarks.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-splice-sky/60 px-3 py-1.5 text-sm dark:border-splice-ocean/60"
            >
              <span className="min-w-0">
                <span className="font-medium">{m.name}</span>{" "}
                <span className="text-splice-ocean dark:text-splice-water">
                  · {m.lat.toFixed(5)}, {m.lon.toFixed(5)}
                  {m.mark_kind === "start_finish" && m.lat2 != null && m.lon2 != null
                    ? ` → ${m.lat2.toFixed(5)}, ${m.lon2.toFixed(5)}`
                    : ""}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onEdit(m)}
                  className="text-splice-blue underline"
                >
                  Edit
                </button>
                <form action={deleteSailingMarkAction}>
                  <input type="hidden" name="group_id" value={groupId} />
                  <input type="hidden" name="mark_id" value={m.id} />
                  <button type="submit" className="text-red-600 underline">
                    Remove
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function markDisplayProps(m: SailingMarkVm): { color: string; label: string } {
  if (m.mark_kind === "start_finish") return { color: "#3b82f6", label: markBadgeLabel(m.name) };
  if (m.mark_kind === "laid") return { color: "#f97316", label: markBadgeLabel(m.name) };

  // Numbered pile / buoy — show number only and apply lateral-mark colours
  if (PILE_BUOY_RE.test(m.name)) {
    const match = m.name.match(/\d+/);
    if (match) {
      const n = parseInt(match[0], 10);
      if (n % 2 === 0 && n >= 4 && n <= 10) return { color: "#ef4444", label: match[0] };
      if (n % 2 === 1 && n >= 1 && n <= 11) return { color: "#22c55e", label: match[0] };
      return { color: "#facc15", label: match[0] };
    }
  }

  return { color: "#facc15", label: markBadgeLabel(m.name) };
}

export function SailingMarksSection({ groupId, marks }: { groupId: string; marks: SailingMarkVm[] }) {
  const [target, setTarget] = useState<EditTarget | null>(null);

  const fallbackCenter = useMemo<{ lat: number; lon: number }>(() => {
    if (marks.length > 0) return { lat: marks[0].lat, lon: marks[0].lon };
    return { lat: DEFAULT_MAP_CENTER[1], lon: DEFAULT_MAP_CENTER[0] };
  }, [marks]);

  const grouped = useMemo(
    () => MARK_GROUPS.map((g) => ({ group: g, groupMarks: marks.filter(g.filter) })),
    [marks],
  );

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Marks ({marks.length})</h2>
        <button
          type="button"
          onClick={() => setTarget({ mode: "create" })}
          className="rounded-lg border border-splice-navy px-3 py-1.5 text-sm font-medium text-splice-navy dark:border-splice-foam dark:text-splice-foam"
        >
          Add mark
        </button>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        {grouped.map(({ group, groupMarks }) => (
          <CollapsibleMarkGroup
            key={group.key}
            group={group}
            groupMarks={groupMarks}
            groupId={groupId}
            onEdit={(m) => setTarget({ mode: "edit", mark: m })}
          />
        ))}
        {marks.length === 0 ? (
          <p className="rounded border border-dashed border-splice-sky px-3 py-4 text-center text-splice-ocean dark:border-splice-ocean dark:text-splice-water">
            No marks yet. Use "Add mark" to place one on the map.
          </p>
        ) : null}
      </div>

      {target ? (
        <MarkEditModal
          groupId={groupId}
          target={target}
          fallbackCenter={fallbackCenter}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </section>
  );
}

function MarkEditModal({
  groupId,
  target,
  fallbackCenter,
  onClose,
}: {
  groupId: string;
  target: EditTarget;
  fallbackCenter: { lat: number; lon: number };
  onClose: () => void;
}) {
  const titleId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const existing = target.mode === "edit" ? target.mark : null;

  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<SailingMarkKind>(existing?.mark_kind ?? "laid");
  const [description, setDescription] = useState(existing?.description ?? "");

  const [latA, setLatA] = useState(fmt(existing?.lat ?? fallbackCenter.lat));
  const [lonA, setLonA] = useState(fmt(existing?.lon ?? fallbackCenter.lon));
  // Offset end B slightly so a brand-new line is visible/draggable.
  const [latB, setLatB] = useState(fmt(existing?.lat2 ?? (existing?.lat ?? fallbackCenter.lat) + 0.0008));
  const [lonB, setLonB] = useState(fmt(existing?.lon2 ?? (existing?.lon ?? fallbackCenter.lon) + 0.0012));

  const isStartFinish = kind === "start_finish";

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const points = useMemo<EditPoint[]>(() => {
    const out: EditPoint[] = [];
    const aLat = parseFloat(latA);
    const aLon = parseFloat(lonA);
    if (Number.isFinite(aLat) && Number.isFinite(aLon)) {
      out.push({
        id: "A",
        lat: aLat,
        lon: aLon,
        label: isStartFinish ? "A" : kind === "fixed" ? "F" : "L",
        color: isStartFinish ? END_A_COLOR : kind === "fixed" ? FIXED_COLOR : LAID_COLOR,
      });
    }
    if (isStartFinish) {
      const bLat = parseFloat(latB);
      const bLon = parseFloat(lonB);
      if (Number.isFinite(bLat) && Number.isFinite(bLon)) {
        out.push({ id: "B", lat: bLat, lon: bLon, label: "B", color: END_B_COLOR });
      }
    }
    return out;
  }, [latA, lonA, latB, lonB, isStartFinish, kind]);

  function handlePointMove(id: string, lat: number, lon: number) {
    if (id === "A") {
      setLatA(lat.toFixed(6));
      setLonA(lon.toFixed(6));
    } else {
      setLatB(lat.toFixed(6));
      setLonB(lon.toFixed(6));
    }
  }

  const inputClass =
    "w-full rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam";
  const labelClass = "flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water";

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[min(90vh,calc(100vh-2rem))] w-full max-w-2xl overflow-y-auto rounded-xl border border-splice-sky bg-white p-5 shadow-lg outline-none dark:border-splice-ocean dark:bg-splice-navy"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-splice-sky pb-4 dark:border-splice-ocean">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
            {existing ? `Edit ${existing.name}` : "Add mark"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-splice-water px-3 py-1.5 text-sm font-medium text-splice-navy-light dark:border-splice-ocean dark:text-splice-sky"
          >
            Close
          </button>
        </div>

        <form action={saveSailingMarkAction} className="space-y-4 pt-4">
          <input type="hidden" name="group_id" value={groupId} />
          {existing ? <input type="hidden" name="mark_id" value={existing.id} /> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Mark name
              <input
                name="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. START/FINISH"
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Type
              <select
                name="mark_kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as SailingMarkKind)}
                className={inputClass}
              >
                <option value="laid">Laid</option>
                <option value="fixed">Fixed</option>
                <option value="start_finish">Start/Finish line</option>
              </select>
            </label>
          </div>

          <p className="text-xs text-splice-ocean dark:text-splice-water">
            {isStartFinish
              ? "Drag each line end on the map, or type its coordinates — the map and the boxes stay in sync."
              : "Drag the mark on the map, or type its coordinates — the map and the boxes stay in sync."}
          </p>

          <MarkEditMap points={points} onPointMove={handlePointMove} />

          {isStartFinish ? (
            <div className="space-y-3">
              <fieldset className="rounded-lg border border-splice-sky p-3 dark:border-splice-ocean">
                <legend className="px-1 text-xs font-semibold" style={{ color: END_A_COLOR }}>
                  Line end A
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={labelClass}>
                    Latitude
                    <input
                      name="lat"
                      type="number"
                      step="any"
                      required
                      value={latA}
                      onChange={(e) => setLatA(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass}>
                    Longitude
                    <input
                      name="lon"
                      type="number"
                      step="any"
                      required
                      value={lonA}
                      onChange={(e) => setLonA(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                </div>
              </fieldset>
              <fieldset className="rounded-lg border border-splice-sky p-3 dark:border-splice-ocean">
                <legend className="px-1 text-xs font-semibold" style={{ color: END_B_COLOR }}>
                  Line end B
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={labelClass}>
                    Latitude
                    <input
                      name="lat2"
                      type="number"
                      step="any"
                      required
                      value={latB}
                      onChange={(e) => setLatB(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass}>
                    Longitude
                    <input
                      name="lon2"
                      type="number"
                      step="any"
                      required
                      value={lonB}
                      onChange={(e) => setLonB(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                </div>
              </fieldset>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Latitude
                <input
                  name="lat"
                  type="number"
                  step="any"
                  required
                  value={latA}
                  onChange={(e) => setLatA(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Longitude
                <input
                  name="lon"
                  type="number"
                  step="any"
                  required
                  value={lonA}
                  onChange={(e) => setLonA(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
          )}

          <label className={labelClass}>
            Description (optional)
            <input
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Committee line"
              className={inputClass}
            />
          </label>

          <div className="flex justify-end gap-3 border-t border-splice-sky pt-4 dark:border-splice-ocean">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-splice-water px-4 py-2 text-sm font-medium text-splice-navy-light dark:border-splice-ocean dark:text-splice-sky"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
            >
              Save mark
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
