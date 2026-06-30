import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyManoeuvreByWindCrossing,
  crossedDeadDownwind,
  crossedHeadToWind,
  findWindAxisCrossingIndices,
  relativeToWindFrom,
} from "./manoeuvre-wind-crossing";

const WIND_FROM = 0;

function pt(hdg: number, cog = hdg) {
  return { hdg, cog, time: 0, lat: 0, lon: 0 };
}

test("crossedHeadToWind detects sign change through head-to-wind", () => {
  assert.equal(crossedHeadToWind(350, 10, WIND_FROM), true);
  assert.equal(crossedHeadToWind(30, 40, WIND_FROM), false);
});

test("crossedDeadDownwind detects pass through 180° on downwind half", () => {
  assert.equal(crossedDeadDownwind(170, 190, WIND_FROM), true);
  assert.equal(crossedDeadDownwind(10, 350, WIND_FROM), false);
});

test("classifyManoeuvreByWindCrossing: tack through head-to-wind", () => {
  const pts = [
    pt(315),
    pt(320),
    pt(325),
    pt(330),
    pt(335),
    pt(340),
    pt(345),
    pt(350),
    pt(355),
    pt(0),
    pt(5),
    pt(10),
    pt(15),
    pt(20),
    pt(25),
    pt(30),
    pt(35),
    pt(40),
    pt(45),
    pt(50),
  ];
  const m = {
    idx: 9,
    preSegment: { endIdx: 8 },
    postSegment: { startIdx: 10 },
    preCOG: 340,
    postCOG: 20,
  };
  const out = classifyManoeuvreByWindCrossing(pts, m, WIND_FROM);
  assert.equal(out.kind, "tack");
  assert.equal(out.crossing, "S→P");
  assert.ok(out.tackCrossIdx != null);
});

test("classifyManoeuvreByWindCrossing: gybe through dead downwind", () => {
  const pts = [
    pt(150),
    pt(155),
    pt(160),
    pt(165),
    pt(170),
    pt(175),
    pt(180),
    pt(185),
    pt(190),
    pt(195),
    pt(200),
    pt(205),
    pt(210),
    pt(215),
    pt(220),
    pt(225),
    pt(230),
    pt(235),
    pt(240),
    pt(245),
  ];
  const m = {
    idx: 9,
    preSegment: { endIdx: 8 },
    postSegment: { startIdx: 10 },
    preCOG: 170,
    postCOG: 210,
  };
  const out = classifyManoeuvreByWindCrossing(pts, m, WIND_FROM);
  assert.equal(out.kind, "gybe");
  assert.equal(out.crossing, "P→S");
  assert.ok(out.gybeCrossIdx != null);
});

test("classifyManoeuvreByWindCrossing: no crossing → none", () => {
  const pts = Array.from({ length: 12 }, (_, i) => pt(40 + i));
  const m = {
    idx: 6,
    preSegment: { endIdx: 5 },
    postSegment: { startIdx: 6 },
    preCOG: 42,
    postCOG: 48,
  };
  const out = classifyManoeuvreByWindCrossing(pts, m, WIND_FROM);
  assert.equal(out.kind, "none");
});

test("findWindAxisCrossingIndices scans turn window", () => {
  const dirs = [340, 345, 350, 355, 0, 5, 10, 15, 20];
  const { tackCrossIdx } = findWindAxisCrossingIndices(
    (i) => dirs[i]!,
    0,
    dirs.length - 1,
    WIND_FROM,
  );
  assert.ok(tackCrossIdx != null);
  assert.ok(relativeToWindFrom(dirs[tackCrossIdx]!, WIND_FROM) < 20);
});
