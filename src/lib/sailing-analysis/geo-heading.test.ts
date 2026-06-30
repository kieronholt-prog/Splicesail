import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attachCourseDir,
  courseDirFromPoint,
  isUpwindHemisphere,
} from "./geo-heading";

test("courseDir prefers compass heading over COG", () => {
  const pts = attachCourseDir([{ lat: 0, lon: 0, time: 0, hdg: 45, cog: 90 }]);
  assert.equal(courseDirFromPoint(pts[0]!), 45);
});

test("courseDir falls back to COG", () => {
  assert.equal(courseDirFromPoint({ cog: 120 }), 120);
});

test("isUpwindHemisphere matches phone semantics", () => {
  assert.equal(isUpwindHemisphere(10, 0), true);
  assert.equal(isUpwindHemisphere(100, 0), false);
});
