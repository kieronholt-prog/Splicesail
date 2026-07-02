import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acuteBearingDiffDeg,
  buildWindTuningFromCourse,
  preferWindHemisphereFromCourse,
} from "./course-wind-baseline";

const marks = [
  { name: "Leeward", lat: 50.84, lon: -1.31, fixed: true },
  { name: "Windward", lat: 50.86, lon: -1.31, fixed: true },
];

test("baseline wind FROM opposes windward-to-previous bearing", () => {
  const tuning = buildWindTuningFromCourse([], marks, "Windward", 1);
  assert.ok(tuning);
  // Windward north of Leeward → downwind bearing ≈ 180°, wind FROM ≈ 0° (north).
  assert.ok(tuning!.baselineWindFromDeg < 30 || tuning!.baselineWindFromDeg > 330);
  assert.equal(tuning!.windward.lat, 50.86);
});

test("returns null without windward mark name", () => {
  assert.equal(buildWindTuningFromCourse([], marks, null, 1), null);
});

test("preferWindHemisphereFromCourse flips wind 180° toward course baseline", () => {
  const baseline = 10;
  assert.equal(preferWindHemisphereFromCourse(190, baseline), 10);
  assert.equal(preferWindHemisphereFromCourse(15, baseline), 15);
});

test("acuteBearingDiffDeg is symmetric and capped at 180", () => {
  assert.equal(acuteBearingDiffDeg(10, 350), 20);
  assert.equal(acuteBearingDiffDeg(0, 180), 180);
});
