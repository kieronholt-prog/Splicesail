"use client";

import { MarineSignalFlagImg } from "@/components/marine-signal-flag-img";
import { marineFlagKeyFromClassFlag } from "@/lib/marine-signal-flags";
import { useCallback, useMemo, useState } from "react";

export type RyaFleetClassRow = { class_key: string; display_name: string; py: number };

type SortMode = "name_az" | "py_asc";

function coerceClassFlag(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s.length) return "";
  const first = s.charAt(0);
  return /^[A-Za-z0-9]$/.test(first) ? first : "";
}

function ClassFlagInput({ initialClassFlag }: { initialClassFlag?: string | null }) {
  const [value, setValue] = useState(() => coerceClassFlag(initialClassFlag ?? ""));
  const previewKey = marineFlagKeyFromClassFlag(value);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="text"
        name="class_flag"
        inputMode="text"
        autoComplete="off"
        maxLength={1}
        aria-label="Class flag (single letter or number)"
        value={value}
        onChange={(e) => setValue(coerceClassFlag(e.target.value))}
        placeholder="—"
        className="max-w-[4.5rem] rounded-lg border border-splice-water bg-white px-3 py-2 text-center font-mono text-lg text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
      />
      {previewKey ? (
        <MarineSignalFlagImg
          flagKey={previewKey}
          alt=""
          className="h-14 w-14 shrink-0 rounded border border-splice-sky object-contain dark:border-splice-ocean"
        />
      ) : null}
      <p className="w-full text-xs text-splice-blue dark:text-splice-water">Leave empty if not used.</p>
    </div>
  );
}

type Props = {
  catalog: RyaFleetClassRow[];
  initialSelectedKeys?: string[];
  initialClassFlag?: string | null;
};

export function FleetClassPicker({
  catalog,
  initialSelectedKeys = [],
  initialClassFlag,
}: Props) {
  const [pyMin, setPyMin] = useState("");
  const [pyMax, setPyMax] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("name_az");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelectedKeys));

  const pyMinNum = pyMin.trim() === "" ? null : Number(pyMin);
  const pyMaxNum = pyMax.trim() === "" ? null : Number(pyMax);

  const filteredSorted = useMemo(() => {
    let rows = [...catalog];
    const minOk = pyMinNum != null && Number.isFinite(pyMinNum);
    const maxOk = pyMaxNum != null && Number.isFinite(pyMaxNum);
    if (minOk || maxOk) {
      rows = rows.filter((r) => {
        if (minOk && r.py < pyMinNum!) return false;
        if (maxOk && r.py > pyMaxNum!) return false;
        return true;
      });
    }
    rows.sort((a, b) => {
      if (sortMode === "py_asc") {
        if (a.py !== b.py) return a.py - b.py;
        return a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" });
      }
      return a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }) || a.py - b.py;
    });
    return rows;
  }, [catalog, pyMinNum, pyMaxNum, sortMode]);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of filteredSorted) {
        next.add(r.class_key);
      }
      return next;
    });
  }, [filteredSorted]);

  const clearVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const vis = new Set(filteredSorted.map((r) => r.class_key));
      for (const k of vis) {
        next.delete(k);
      }
      return next;
    });
  }, [filteredSorted]);

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="rounded-lg border border-splice-sky p-4 dark:border-splice-ocean">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
          Class flag
        </legend>
        <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
          Letter or number
          <ClassFlagInput initialClassFlag={initialClassFlag} />
        </label>
      </fieldset>

      <fieldset className="rounded-lg border border-splice-sky p-4 dark:border-splice-ocean">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
          Refine by Portsmouth (PY)
        </legend>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            PY from
            <input
              type="number"
              min={400}
              max={3000}
              value={pyMin}
              onChange={(e) => setPyMin(e.target.value)}
              placeholder="Lowest PN"
              className="w-36 rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            PY to
            <input
              type="number"
              min={400}
              max={3000}
              value={pyMax}
              onChange={(e) => setPyMax(e.target.value)}
              placeholder="Highest PN"
              className="w-36 rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            List sort
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="min-w-[12rem] rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            >
              <option value="name_az">Class name A–Z</option>
              <option value="py_asc">PY number (low → high)</option>
            </select>
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-splice-ocean dark:text-splice-water">
          Boat classes <span className="font-normal text-splice-blue">({filteredSorted.length} in range)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={selectVisible}
            className="rounded-lg border border-splice-water px-3 py-1.5 text-xs font-medium text-splice-navy-light dark:border-splice-ocean dark:text-splice-sky"
          >
            Select visible
          </button>
          <button
            type="button"
            onClick={clearVisible}
            className="rounded-lg border border-splice-water px-3 py-1.5 text-xs font-medium text-splice-navy-light dark:border-splice-ocean dark:text-splice-sky"
          >
            Clear visible
          </button>
        </div>
      </div>

      <div className="max-h-[min(28rem,50vh)] overflow-auto rounded-lg border border-splice-sky dark:border-splice-ocean">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 border-b border-splice-sky bg-splice-surface dark:border-splice-ocean dark:bg-splice-navy">
            <tr>
              <th className="w-12 px-3 py-2 text-splice-ocean dark:text-splice-water">&nbsp;</th>
              <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Class</th>
              <th className="w-28 px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">PY</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-splice-foam dark:divide-splice-navy-light">
            {filteredSorted.map((row) => {
              const isOn = selected.has(row.class_key);
              return (
                <tr key={row.class_key} className={isOn ? "bg-splice-foam/60 dark:bg-splice-navy-light/20" : ""}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => toggle(row.class_key)}
                      className="h-4 w-4 rounded border-splice-water"
                      aria-label={`Include ${row.display_name}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-splice-navy dark:text-splice-foam">{row.display_name}</td>
                  <td className="px-3 py-2 tabular-nums text-splice-ocean dark:text-splice-water">{row.py}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {[...selected].map((class_key) => (
        <input key={class_key} type="hidden" name="class_keys" value={class_key} />
      ))}

      <p className="text-xs text-splice-blue dark:text-splice-water">
        {selected.size} class{selected.size !== 1 ? "es" : ""} selected in total — including selections not shown
        while a PY filter hides them.
      </p>
    </div>
  );
}
