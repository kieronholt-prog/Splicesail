import { test } from "node:test";
import assert from "node:assert/strict";
import {
  courseToDisplayEntries,
  expandAnalysisRoundingSequence,
} from "./course-rounding-sequence";
import type { SailingCourseRow } from "./types";

const kinds = new Map<string, string>([
  ["START/FINISH", "start_finish"],
  ["BUOY 11", "laid"],
  ["PILE 6", "laid"],
  ["PILE 10", "laid"],
  ["HAMBLE PT", "laid"],
]);

const courseA: SailingCourseRow = {
  id: "c1",
  group_id: "g1",
  course_letter: "A",
  display_name: "A",
  course_type: "SC",
  mark_sequence: [
    ["START/FINISH", "P"],
    ["BUOY 11", "S"],
    ["PILE 6", "S"],
    ["PILE 10", "S"],
  ],
  marks_preamble: [],
  cross_sf_each_lap: false,
  sort_order: 0,
  course_mark_overrides: {},
};

test("expandAnalysisRoundingSequence repeats lap marks only", () => {
  const steps = expandAnalysisRoundingSequence(courseA, 2, kinds);
  assert.equal(steps.length, 7);
  assert.equal(steps[0]?.name, "START/FINISH");
  assert.equal(steps[0]?.lap, 0);
  assert.equal(steps[0]?.partOfLap, false);
  assert.equal(steps[1]?.name, "BUOY 11");
  assert.equal(steps[1]?.lap, 1);
  assert.equal(steps[4]?.name, "BUOY 11");
  assert.equal(steps[4]?.lap, 2);
});

test("expandAnalysisRoundingSequence includes prefix once before laps", () => {
  const withPre: SailingCourseRow = {
    ...courseA,
    marks_preamble: [["HAMBLE PT", "P"]],
  };
  const steps = expandAnalysisRoundingSequence(withPre, 2, kinds);
  assert.equal(steps[0]?.name, "START/FINISH");
  assert.equal(steps[0]?.lap, 0);
  assert.equal(steps[1]?.name, "HAMBLE PT");
  assert.equal(steps[1]?.lap, 0);
  assert.equal(steps[1]?.partOfLap, false);
  assert.equal(steps[2]?.lap, 1);
  assert.equal(steps[5]?.lap, 2);
});

test("courseToDisplayEntries inserts preamble after start line", () => {
  const withPre: SailingCourseRow = {
    ...courseA,
    marks_preamble: [["HAMBLE PT", "P"]],
  };
  const entries = courseToDisplayEntries(withPre);
  assert.deepEqual(
    entries.map((e) => e.name),
    ["START/FINISH", "HAMBLE PT", "BUOY 11", "PILE 6", "PILE 10"],
  );
  assert.equal(entries[1]?.partOfLap, false);
});
