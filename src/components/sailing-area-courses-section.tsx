"use client";

import { useMemo, useState } from "react";
import { deleteSailingCourseAction, saveSailingCourseAction } from "@/app/actions/club-sailing-area";
import { isLineMark, type SailingCourseRow } from "@/lib/sailing-analysis/types";
import type { SailingMarkVm } from "@/components/sailing-area-marks-section";

// ─── Types ───────────────────────────────────────────────────────────────────

export type MarkEntry = { name: string; tack: "P" | "S"; firstLapOnly: boolean };

// ─── Constants ───────────────────────────────────────────────────────────────

export const TACK_COLOR = { P: "#ef4444", S: "#22c55e" } as const;

export const COURSE_TYPE_LABEL: Record<string, string> = {
  SC: "Short",
  MC: "Medium",
  LC: "Long",
  custom: "Custom",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function courseToEntries(c: SailingCourseRow): MarkEntry[] {
  const pre = ((c.marks_preamble ?? []) as [string, "P" | "S"][]).map(([name, tack]) => ({
    name,
    tack,
    firstLapOnly: true,
  }));
  const seq = ((c.mark_sequence ?? []) as [string, "P" | "S"][]).map(([name, tack]) => ({
    name,
    tack,
    firstLapOnly: false,
  }));
  return [...pre, ...seq];
}

export function entriesToPayload(entries: MarkEntry[]) {
  return {
    marks_preamble: entries
      .filter((e) => e.firstLapOnly)
      .map((e) => [e.name, e.tack] as [string, "P" | "S"]),
    mark_sequence: entries
      .filter((e) => !e.firstLapOnly)
      .map((e) => [e.name, e.tack] as [string, "P" | "S"]),
  };
}

// ─── Mark editor row ──────────────────────────────────────────────────────────

function MarkEditorRow({
  entry,
  index,
  total,
  isStartFinish,
  onChange,
  onDelete,
  onMove,
}: {
  entry: MarkEntry;
  index: number;
  total: number;
  isStartFinish?: boolean;
  onChange: (e: MarkEntry) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const color = isStartFinish ? "#3b82f6" : TACK_COLOR[entry.tack];
  return (
    <div className="flex items-center gap-2 rounded border border-splice-sky/60 px-2 py-1.5 text-sm dark:border-splice-ocean/60">
      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-splice-ocean dark:text-splice-water">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium" style={{ color }}>
        {entry.name}
      </span>
      {!isStartFinish && (
        <button
          type="button"
          title={entry.tack === "P" ? "Port rounding — click to switch" : "Starboard rounding — click to switch"}
          onClick={() => onChange({ ...entry, tack: entry.tack === "P" ? "S" : "P" })}
          className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold"
          style={{ background: color + "28", color }}
        >
          {entry.tack === "P" ? "Port" : "Stbd"}
        </button>
      )}
      <label className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-splice-ocean dark:text-splice-water">
        <input
          type="checkbox"
          checked={entry.firstLapOnly}
          onChange={(e) => onChange({ ...entry, firstLapOnly: e.target.checked })}
          className="h-3 w-3 rounded"
        />
        <span className="hidden sm:inline">1st lap</span>
        <span className="sm:hidden">1L</span>
      </label>
      <button
        type="button"
        disabled={index === 0}
        onClick={() => onMove(-1)}
        className="shrink-0 text-splice-ocean disabled:opacity-25 dark:text-splice-water"
        title="Move up"
      >
        ↑
      </button>
      <button
        type="button"
        disabled={index === total - 1}
        onClick={() => onMove(1)}
        className="shrink-0 text-splice-ocean disabled:opacity-25 dark:text-splice-water"
        title="Move down"
      >
        ↓
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 text-red-500 hover:text-red-700"
        title="Remove mark"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Add course form ──────────────────────────────────────────────────────────

export function AddCourseForm({ groupId, onDone }: { groupId: string; onDone: () => void }) {
  const inputClass =
    "w-full rounded-lg border border-splice-water bg-white px-2 py-1.5 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam";
  return (
    <form
      action={saveSailingCourseAction}
      className="space-y-2 rounded-lg border border-dashed border-splice-sky p-4 text-sm dark:border-splice-ocean"
    >
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="mark_sequence" value="[]" />
      <input type="hidden" name="marks_preamble" value="[]" />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
          Course letter
          <input name="course_letter" placeholder="e.g. A" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
          Display name
          <input name="display_name" placeholder="e.g. Triangle" required className={inputClass} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
        Course type
        <select name="course_type" defaultValue="SC" className={inputClass}>
          <option value="SC">Short course</option>
          <option value="MC">Medium course</option>
          <option value="LC">Long course</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="flex-1 rounded-lg bg-splice-navy py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
        >
          Create course
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-splice-water px-4 py-2 text-sm font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Course detail panel (always-expanded, no map) ────────────────────────────

export function CourseDetailPanel({
  course,
  allMarks,
  groupId,
}: {
  course: SailingCourseRow;
  allMarks: SailingMarkVm[];
  groupId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [entries, setEntries] = useState<MarkEntry[]>(() => courseToEntries(course));
  const [crossSfEachLap, setCrossSfEachLap] = useState(course.cross_sf_each_lap ?? false);
  const [addMarkName, setAddMarkName] = useState("");
  const [addTack, setAddTack] = useState<"P" | "S">("S");

  const byName = useMemo(() => new Map(allMarks.map((m) => [m.name, m])), [allMarks]);
  const savedEntries = useMemo(() => courseToEntries(course), [course]);
  const hasFirstLap = savedEntries.some((e) => e.firstLapOnly);

  const usedNames = useMemo(() => new Set(entries.map((e) => e.name)), [entries]);
  const availableNames = useMemo(
    () => allMarks.map((m) => m.name).filter((n) => !usedNames.has(n)),
    [allMarks, usedNames],
  );

  const { mark_sequence, marks_preamble } = useMemo(() => entriesToPayload(entries), [entries]);

  function handleMove(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= entries.length) return;
    const next = [...entries];
    [next[i], next[j]] = [next[j], next[i]];
    setEntries(next);
  }

  function handleAdd() {
    if (!addMarkName) return;
    setEntries((prev) => [...prev, { name: addMarkName, tack: addTack, firstLapOnly: false }]);
    setAddMarkName("");
  }

  function cancelEdit() {
    setEntries(courseToEntries(course));
    setCrossSfEachLap(course.cross_sf_each_lap ?? false);
    setEditing(false);
  }

  return (
    <div className="space-y-3 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded bg-splice-navy/10 px-2 py-0.5 text-sm font-bold text-splice-navy dark:bg-splice-foam/10 dark:text-splice-foam">
            {course.course_letter}
          </span>
          <span className="text-xs text-splice-ocean dark:text-splice-water">
            {COURSE_TYPE_LABEL[course.course_type] ?? course.course_type}
          </span>
          <span className="font-medium text-splice-navy dark:text-splice-foam">{course.display_name}</span>
        </div>
        <div className="flex shrink-0 gap-2">
          {editing ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-splice-water px-3 py-1 text-xs font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-splice-water px-3 py-1 text-xs font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
            >
              Edit
            </button>
          )}
          <form action={deleteSailingCourseAction}>
            <input type="hidden" name="group_id" value={groupId} />
            <input type="hidden" name="course_id" value={course.id} />
            <button
              type="submit"
              className="rounded-lg border border-red-300 px-3 py-1 text-xs font-medium text-red-600 dark:border-red-800 dark:text-red-400"
            >
              Remove
            </button>
          </form>
        </div>
      </div>

      {/* Validation: first mark must be a start line, last must be a finish line */}
      {!editing && savedEntries.length > 0 && (() => {
        const firstKind = byName.get(savedEntries[0].name)?.mark_kind;
        const lastKind = byName.get(savedEntries[savedEntries.length - 1].name)?.mark_kind;
        const firstOk = firstKind && (firstKind === "start_finish" || firstKind === "start_line");
        const lastOk = lastKind && (lastKind === "start_finish" || lastKind === "finish_line");
        if (firstOk && lastOk) return null;
        return (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
            {!firstOk && "First mark should be a Start or Start/Finish line. "}
            {!lastOk && "Last mark should be a Finish or Start/Finish line."}
          </p>
        );
      })()}

      {/* Saved mark sequence (always visible) */}
      {!editing && (
        <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
          {savedEntries.length === 0 ? (
            <span className="text-xs text-splice-ocean dark:text-splice-water">
              No marks — click Edit to add some.
            </span>
          ) : (
            savedEntries.map((e, i) => {
              const markKind = byName.get(e.name)?.mark_kind;
              const isLine = markKind ? isLineMark(markKind) : false;
              const color = isLine ? "#3b82f6" : TACK_COLOR[e.tack];
              // Line marks always keep their name; only non-line 1st-lap marks go lowercase
              const display = (e.firstLapOnly && !isLine) ? e.name.toLowerCase() : e.name;
              return (
                <span
                  key={i}
                  className="whitespace-nowrap text-xs font-medium"
                  style={{ color }}
                  title={e.firstLapOnly ? "1st lap only" : undefined}
                >
                  {display}
                  {i < savedEntries.length - 1 ? (
                    <span className="mx-0.5 text-splice-water dark:text-splice-ocean"> →</span>
                  ) : null}
                </span>
              );
            })
          )}
          {hasFirstLap && (
            <span className="ml-1 text-xs text-splice-ocean dark:text-splice-water opacity-60">
              (lowercase = 1st lap only)
            </span>
          )}
        </div>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="space-y-2">
          {entries.length === 0 && (
            <p className="rounded border border-dashed border-splice-sky px-3 py-3 text-center text-xs text-splice-ocean dark:border-splice-ocean dark:text-splice-water">
              No marks — add one below.
            </p>
          )}

          {entries.map((e, i) => (
            <MarkEditorRow
              key={`${e.name}-${i}`}
              entry={e}
              index={i}
              total={entries.length}
              isStartFinish={byName.get(e.name)?.mark_kind === "start_finish"}
              onChange={(updated) =>
                setEntries((prev) => prev.map((x, idx) => (idx === i ? updated : x)))
              }
              onDelete={() => setEntries((prev) => prev.filter((_, idx) => idx !== i))}
              onMove={(dir) => handleMove(i, dir)}
            />
          ))}

          {/* Add mark row */}
          <div className="flex items-center gap-2 rounded border border-dashed border-splice-sky px-2 py-1.5 dark:border-splice-ocean">
            <select
              value={addMarkName}
              onChange={(e) => setAddMarkName(e.target.value)}
              className="min-w-0 flex-1 rounded bg-transparent text-sm text-splice-navy dark:text-splice-foam"
            >
              <option value="">— Add mark —</option>
              {availableNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              title={addTack === "P" ? "Port — click to switch" : "Starboard — click to switch"}
              onClick={() => setAddTack((v) => (v === "P" ? "S" : "P"))}
              className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold"
              style={{ background: TACK_COLOR[addTack] + "28", color: TACK_COLOR[addTack] }}
            >
              {addTack === "P" ? "Port" : "Stbd"}
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!addMarkName}
              className="shrink-0 rounded-lg border border-splice-navy px-2 py-0.5 text-xs font-medium text-splice-navy disabled:opacity-40 dark:border-splice-foam dark:text-splice-foam"
            >
              Add
            </button>
          </div>

          {/* Save */}
          <form action={saveSailingCourseAction} className="space-y-3 pt-1">
            <input type="hidden" name="group_id" value={groupId} />
            <input type="hidden" name="course_id" value={course.id} />
            <input type="hidden" name="course_letter" value={course.course_letter} />
            <input type="hidden" name="display_name" value={course.display_name} />
            <input type="hidden" name="course_type" value={course.course_type} />
            <input type="hidden" name="mark_sequence" value={JSON.stringify(mark_sequence)} />
            <input type="hidden" name="marks_preamble" value={JSON.stringify(marks_preamble)} />

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-splice-sky px-3 py-2 text-xs dark:border-splice-ocean">
              <input
                type="checkbox"
                name="cross_sf_each_lap"
                checked={crossSfEachLap}
                onChange={(e) => setCrossSfEachLap(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span className="font-medium text-splice-navy dark:text-splice-foam">
                Cross start/finish line on each lap
              </span>
              <span className="ml-auto text-splice-ocean dark:text-splice-water">
                {crossSfEachLap ? "Yes" : "No (default)"}
              </span>
            </label>

            <button
              type="submit"
              className="w-full rounded-lg bg-splice-navy py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
            >
              Save course
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
