import { test } from "node:test";
import assert from "node:assert/strict";
import {
  courseToEntries,
  courseToDisplayEntries,
  entriesToPayload,
  expandEntriesForLaps,
  splitEntriesByLapRole,
} from "./course-mark-entries";
import { expandAnalysisRoundingSequence } from "./course-rounding-sequence";
import type { SailingCourseRow } from "./types";

const baseCourse: SailingCourseRow = {
  id: "c1",
  group_id: "g1",
  course_letter: "A",
  display_name: "A",
  course_type: "SC",
  mark_sequence: [
    ["START/FINISH", "P"],
    ["BUOY 11", "S"],
    ["PILE 6", "S"],
    ["FINISH LINE", "P"],
  ],
  marks_preamble: [],
  cross_sf_each_lap: false,
  sort_order: 0,
  course_mark_overrides: {},
};

test("entriesToPayload stores partOfLap on each mark row", () => {
  const payload = entriesToPayload([
    { name: "START", tack: "P", partOfLap: false },
    { name: "WINDWARD", tack: "S", partOfLap: true },
    { name: "FINISH", tack: "P", partOfLap: false },
  ]);
  assert.deepEqual(payload.marks_preamble, []);
  assert.deepEqual(payload.mark_sequence, [
    ["START", "P", false],
    ["WINDWARD", "S", true],
    ["FINISH", "P", false],
  ]);
});

test("courseToEntries reads stored partOfLap rows", () => {
  const c: SailingCourseRow = {
    ...baseCourse,
    marks_preamble: [],
    mark_sequence: [
      ["START", "P", false],
      ["WINDWARD", "S", true],
      ["FINISH", "P", false],
    ] as unknown as [string, "P" | "S"][],
  };
  const entries = courseToEntries(c);
  assert.equal(entries[2]?.partOfLap, false);
});

test("expandEntriesForLaps: prefix, lap block, suffix", () => {
  const entries = [
    { name: "START", tack: "P" as const, partOfLap: false },
    { name: "HAMBLE", tack: "P" as const, partOfLap: false },
    { name: "WILLIAM", tack: "S" as const, partOfLap: true },
    { name: "CORONATION", tack: "P" as const, partOfLap: true },
    { name: "FINISH", tack: "P" as const, partOfLap: false },
  ];
  const expanded = expandEntriesForLaps(entries, 2, (i) => entries[i]!);
  assert.deepEqual(
    expanded.map((s) => `${s.name}@${s.lap}`),
    [
      "START@0",
      "HAMBLE@0",
      "WILLIAM@1",
      "CORONATION@1",
      "WILLIAM@2",
      "CORONATION@2",
      "FINISH@3",
    ],
  );
});

test("legacy import sets finish line last-lap-only when cross_sf_each_lap is false", () => {
  const kinds = new Map<string, string>([
    ["START/FINISH", "start_finish"],
    ["FINISH LINE", "finish_line"],
  ]);
  const entries = courseToEntries(baseCourse, kinds);
  const finish = entries[entries.length - 1];
  assert.equal(finish?.name, "FINISH LINE");
  assert.equal(finish?.partOfLap, false);
  assert.equal(entries[0]?.partOfLap, false);
  assert.equal(entries[1]?.partOfLap, true);
});

test("expandAnalysisRoundingSequence uses suffix finish once after laps", () => {
  const c: SailingCourseRow = {
    ...baseCourse,
    mark_sequence: [
      ["START", "P", false],
      ["MK1", "S", true],
      ["FINISH", "P", false],
    ] as unknown as [string, "P" | "S"][],
  };
  const steps = expandAnalysisRoundingSequence(c, 2);
  assert.deepEqual(
    steps.map((s) => `${s.name} L${s.lap}`),
    ["START L0", "MK1 L1", "MK1 L2", "FINISH L3"],
  );
});

test("splitEntriesByLapRole groups prefix, lap block, suffix", () => {
  const { prefix, lapBlock, suffix } = splitEntriesByLapRole([
    { name: "A", tack: "P", partOfLap: false },
    { name: "B", tack: "S", partOfLap: true },
    { name: "C", tack: "P", partOfLap: false },
  ]);
  assert.deepEqual(prefix.map((e) => e.name), ["A"]);
  assert.deepEqual(lapBlock.map((e) => e.name), ["B"]);
  assert.deepEqual(suffix.map((e) => e.name), ["C"]);
});
