import { isLineMark, type SailingCourseRow } from "./types";

export type MarkEntry = { name: string; tack: "P" | "S"; partOfLap: boolean };

export type StoredMarkRow = [string, "P" | "S"] | [string, "P" | "S", boolean];

function isStoredMarkRowWithLapFlag(row: unknown): row is [string, "P" | "S", boolean] {
  return Array.isArray(row) && row.length >= 3 && typeof row[2] === "boolean";
}

function tackFromRow(t: unknown): "P" | "S" {
  return t === "P" ? "P" : "S";
}

/** Ordered marks for course builder / analysis (display order). */
export function courseToDisplayEntries(c: SailingCourseRow): MarkEntry[] {
  const seqRaw = (c.mark_sequence ?? []) as unknown[];
  if (seqRaw.length > 0 && isStoredMarkRowWithLapFlag(seqRaw[0])) {
    return seqRaw.map((row) => ({
      name: String(row[0]),
      tack: tackFromRow(row[1]),
      partOfLap: Boolean(row[2]),
    }));
  }

  const pre = ((c.marks_preamble ?? []) as [string, "P" | "S"][]).map(([name, tack]) => ({
    name,
    tack,
    partOfLap: false,
  }));
  const seq = ((c.mark_sequence ?? []) as [string, "P" | "S"][]).map(([name, tack]) => ({
    name,
    tack,
    partOfLap: true,
  }));

  if (pre.length > 0 && seq.length > 0) {
    return [seq[0]!, ...pre, ...seq.slice(1)];
  }
  return pre.length > 0 ? [...pre, ...seq] : seq;
}

/** Legacy import: infer part-of-lap flags from preamble + sequence storage. */
export function legacyCourseToEntries(
  c: SailingCourseRow,
  markKindByName?: Map<string, string>,
): MarkEntry[] {
  const preambleNames = new Set(
    ((c.marks_preamble ?? []) as [string, string][]).map(([name]) => name),
  );
  const crossSf = c.cross_sf_each_lap ?? false;
  const ordered = courseToDisplayEntries({
    ...c,
    mark_sequence: (c.mark_sequence ?? []) as [string, "P" | "S"][],
    marks_preamble: (c.marks_preamble ?? []) as [string, "P" | "S"][],
  });

  return ordered.map((e, index) => {
    if (preambleNames.has(e.name)) {
      return { ...e, partOfLap: false };
    }

    const kind = markKindByName?.get(e.name);
    const line = kind ? isLineMark(kind as never) : false;
    let partOfLap = true;

    if (!crossSf && line) {
      if (index === 0) partOfLap = false;
      if (index === ordered.length - 1) partOfLap = false;
    }

    return { ...e, partOfLap };
  });
}

export function courseToEntries(
  c: SailingCourseRow,
  markKindByName?: Map<string, string>,
): MarkEntry[] {
  const seqRaw = (c.mark_sequence ?? []) as unknown[];
  if (seqRaw.length > 0 && isStoredMarkRowWithLapFlag(seqRaw[0])) {
    return courseToDisplayEntries(c);
  }
  return legacyCourseToEntries(c, markKindByName);
}

export function entriesToPayload(entries: MarkEntry[]) {
  return {
    marks_preamble: [] as [string, "P" | "S"][],
    mark_sequence: entries.map(
      (e) => [e.name, e.tack, e.partOfLap] as [string, "P" | "S", boolean],
    ),
  };
}

export function splitEntriesByLapRole(entries: MarkEntry[]) {
  const prefix: MarkEntry[] = [];
  const lapBlock: MarkEntry[] = [];
  const suffix: MarkEntry[] = [];
  let seenLap = false;

  for (const e of entries) {
    if (e.partOfLap) {
      seenLap = true;
      lapBlock.push(e);
    } else if (!seenLap) {
      prefix.push(e);
    } else {
      suffix.push(e);
    }
  }

  return { prefix, lapBlock, suffix };
}

export type ExpandedCourseMark<T> = T & { lap: number; seqIdx: number; partOfLap: boolean };

/** Race rounding order: prefix once, lap block × laps, suffix once (e.g. finish). */
export function expandEntriesForLaps<T extends { name: string }>(
  entries: MarkEntry[],
  laps: number,
  resolveAt: (index: number) => T | null,
): ExpandedCourseMark<T>[] {
  const { prefix, lapBlock, suffix } = splitEntriesByLapRole(entries);
  const nLaps = Math.max(1, Math.round(Number(laps)) || 1);
  const out: ExpandedCourseMark<T>[] = [];
  let seqIdx = 0;

  const pushEntry = (entryIndex: number, lap: number) => {
    const e = entries[entryIndex]!;
    const row = resolveAt(entryIndex);
    if (!row) return;
    out.push({ ...row, lap, seqIdx: seqIdx++, partOfLap: e.partOfLap });
  };

  let idx = 0;
  for (let n = 0; n < prefix.length; n++) pushEntry(idx++, 0);
  const lapStartIdx = idx;
  for (let lapN = 1; lapN <= nLaps; lapN++) {
    for (let n = 0; n < lapBlock.length; n++) pushEntry(lapStartIdx + n, lapN);
  }
  idx = lapStartIdx + lapBlock.length;
  for (let n = 0; n < suffix.length; n++) pushEntry(idx++, nLaps + 1);

  return out;
}

/** @deprecated Use courseToDisplayEntries */
export const courseToEntriesLegacyDisplay = courseToDisplayEntries;
