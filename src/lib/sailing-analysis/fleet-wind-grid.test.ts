import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFleetWindGrid,
  extractUpwindSamplesBetweenTacks,
  fleetWindGridTimeBuckets,
  fleetWindGridToGeoJSON,
  tackAngleFromSnapshot,
  twaFromTackAngle,
  windFromCogAndTackSide,
} from "./fleet-wind-grid";

function makeUpwindTrack(windFrom: number, portCog: number, stbdCog: number, t0: number) {
  const points: {
    lat: number;
    lon: number;
    time: number;
    ss: number;
    cog: number;
    dir: number;
  }[] = [];
  let t = t0;
  let lat = 50.8;
  let lon = -1.12;
  const tackIndices: number[] = [];
  const add = (cog: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const rad = (cog * Math.PI) / 180;
      lat += Math.cos(rad) * 0.00008;
      lon += Math.sin(rad) * 0.00012;
      points.push({ lat, lon, time: t, ss: 2.5, cog, dir: cog });
      t += 4;
    }
  };
  add(portCog, 15);
  tackIndices.push(14);
  add(stbdCog, 15);
  tackIndices.push(29);
  add(portCog, 15);
  tackIndices.push(44);

  const tacks = tackIndices.map((turnIdx) => ({
    type: "tack",
    turnIdx,
    excludeFromStatsAndVMG: false,
  }));

  const legs = [{ type: "upwind", startIdx: 0, endIdx: points.length - 1 }];

  return {
    points,
    tacks,
    legs,
    windDir: windFrom,
    baselines: { tackAngle: Math.abs(((portCog - stbdCog + 540) % 360) - 180) },
  };
}

test("twaFromTackAngle uses half the average tack angle", () => {
  assert.equal(twaFromTackAngle(84), 42);
  assert.equal(twaFromTackAngle(100), 50);
  assert.equal(twaFromTackAngle(90), 45);
});

test("windFromCogAndTackSide: starboard COG 180 with TWA 45 gives wind from 225", () => {
  assert.equal(windFromCogAndTackSide(180, 45, "S"), 225);
});

test("windFromCogAndTackSide: port COG 135 with TWA 45 gives wind from 90", () => {
  assert.equal(windFromCogAndTackSide(135, 45, "P"), 90);
});

test("extractUpwindSamplesBetweenTacks yields samples between tacks", () => {
  const wind = 0;
  const snap = makeUpwindTrack(wind, 42, 318);
  const samples = extractUpwindSamplesBetweenTacks(snap, "sub-a", wind);
  assert.ok(samples.length >= 10);
  for (const s of samples) {
    assert.ok(s.vmgKts > 0);
    assert.ok(s.windFromDeg >= 0 && s.windFromDeg < 360);
  }
});

test("buildFleetWindGrid merges two boats in same cell", () => {
  const wind = 10;
  const snap1 = makeUpwindTrack(wind, 52, 328, 1_700_000_000);
  const snap2 = makeUpwindTrack(wind, 50, 326, 1_700_000_100);
  const grid = buildFleetWindGrid(
    [
      { submissionId: "a", snapshot: snap1 },
      { submissionId: "b", snapshot: snap2 },
    ],
    wind,
  );
  assert.ok(grid);
  assert.ok(grid!.cells.length >= 1);
  const multiBoat = grid!.cells.find((c) => c.boatCount >= 2);
  assert.ok(multiBoat, "expected at least one cell with both boats");
  const geo = fleetWindGridToGeoJSON(grid!);
  assert.ok(geo.features.length >= 2);
});

test("fleetWindGridToGeoJSON filters by time bucket", () => {
  const wind = 10;
  const snap1 = makeUpwindTrack(wind, 52, 328, 1_700_000_000);
  const snap2 = makeUpwindTrack(wind, 50, 326, 1_700_000_600);
  const grid = buildFleetWindGrid(
    [
      { submissionId: "a", snapshot: snap1 },
      { submissionId: "b", snapshot: snap2 },
    ],
    wind,
    { timeBucketSec: 300 },
  );
  assert.ok(grid);
  const buckets = fleetWindGridTimeBuckets(grid!);
  assert.ok(buckets.length >= 2, "expected samples in different 5 min buckets");
  const firstOnly = fleetWindGridToGeoJSON(grid!, { timeBucket: buckets[0] });
  const all = fleetWindGridToGeoJSON(grid!);
  assert.ok(firstOnly.features.length < all.features.length);
});
