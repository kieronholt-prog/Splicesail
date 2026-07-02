import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFleetWindGrid,
  extractUpwindSamplesBetweenTacks,
  fleetWindGridTimeBuckets,
  fleetWindGridToGeoJSON,
  likelyTwaFromSnapshot,
  signedTwaForTackSide,
  tackAngleFromSnapshot,
  tackSideAfterManoeuvre,
  tackSideFromCourse,
  twaFromTackAngle,
  windFromCogAndTackSide,
  windFromHeadingAndSignedTwa,
} from "./fleet-wind-grid";
import {
  buildUpwindBetweenTackPointKinds,
  buildUpwindBetweenTackTrackSegmentFC,
} from "./upwind-tack-track-segments";

function makeUpwindTrack(
  windFrom: number,
  portCog: number,
  stbdCog: number,
  t0 = 1_700_000_000,
) {
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

  const tackAngle = Math.abs(((portCog - stbdCog + 540) % 360) - 180);
  const tacks = tackIndices.map((turnIdx, i) => ({
    type: "tack",
    turnIdx,
    excludeFromStatsAndVMG: false,
    crossing: i % 2 === 0 ? "P→S" : "S→P",
    sideAft: i % 2 === 0 ? "S" : "P",
    sideBef: i % 2 === 0 ? "P" : "S",
  }));

  const legs = [{ type: "upwind", startIdx: 0, endIdx: points.length - 1 }];

  return {
    points,
    tacks,
    legs,
    windDir: windFrom,
    baselines: { tackAngle },
    upwindByTack: {
      port: { twaFromWind: tackAngle / 2 },
      stbd: { twaFromWind: tackAngle / 2 },
      p2sTwaDiff: tackAngle,
    },
  };
}

test("twaFromTackAngle uses half the average tack angle", () => {
  assert.equal(twaFromTackAngle(84), 42);
  assert.equal(twaFromTackAngle(100), 50);
  assert.equal(twaFromTackAngle(90), 45);
});

test("likelyTwaFromSnapshot prefers measured port/stbd TWA", () => {
  const snap = {
    baselines: { tackAngle: 84 },
    upwindByTack: { port: { twaFromWind: 38 }, stbd: { twaFromWind: 44 } },
  };
  assert.equal(likelyTwaFromSnapshot(snap, "P"), 38);
  assert.equal(likelyTwaFromSnapshot(snap, "S"), 44);
});

test("tackSideAfterManoeuvre uses sideAft and crossing labels", () => {
  assert.equal(tackSideAfterManoeuvre({ sideAft: "P" }, 90, 0), "P");
  assert.equal(tackSideAfterManoeuvre({ crossing: "P→S" }, 90, 0), "S");
  assert.equal(tackSideAfterManoeuvre({ crossing: "S→P" }, 270, 0), "P");
});

test("windFromCogAndTackSide: starboard COG 180 with TWA 45 gives wind from 225", () => {
  assert.equal(windFromCogAndTackSide(180, 45, "S"), 225);
});

test("windFromCogAndTackSide: port COG 135 with TWA 45 gives wind from 90", () => {
  assert.equal(windFromCogAndTackSide(135, 45, "P"), 90);
});

test("wind inference round-trip: inferred wind matches reference for symmetric track", () => {
  const wind = 10;
  const twa = 42;
  const portCog = (wind + twa + 360) % 360;
  const stbdCog = (wind - twa + 360) % 360;
  const snap = makeUpwindTrack(wind, portCog, stbdCog);
  const samples = extractUpwindSamplesBetweenTacks(snap, "sub-a", wind);
  assert.ok(samples.length >= 10);
  for (const s of samples) {
    const err = Math.min(
      Math.abs(s.windFromDeg - wind),
      360 - Math.abs(s.windFromDeg - wind),
    );
    assert.ok(err < 6, `wind error ${err} for tack ${s.tackSide}`);
  }
});

test("extractUpwindSamplesBetweenTacks yields samples between tacks", () => {
  const wind = 0;
  const snap = makeUpwindTrack(wind, 42, 318);
  const samples = extractUpwindSamplesBetweenTacks(snap, "sub-a", wind);
  assert.ok(samples.length >= 10);
  for (const s of samples) {
    assert.ok(s.vmgKts > 0);
    assert.ok(s.windFromDeg >= 0 && s.windFromDeg < 360);
    assert.ok(s.tackSide === "P" || s.tackSide === "S");
  }
});

test("windFromHeadingAndSignedTwa: unified heading − signed TWA", () => {
  assert.equal(windFromHeadingAndSignedTwa(180, -45), 225);
  assert.equal(windFromHeadingAndSignedTwa(135, 45), 90);
  assert.equal(
    windFromCogAndTackSide(180, 45, "S"),
    windFromHeadingAndSignedTwa(180, signedTwaForTackSide(45, "S")),
  );
});

test("tackSideFromCourse matches analytic port/stbd headings", () => {
  assert.equal(tackSideFromCourse(45, 0), "P");
  assert.equal(tackSideFromCourse(315, 0), "S");
});

test("extractUpwindSamplesBetweenTacks works when course legs are not typed upwind", () => {
  const wind = 10;
  const snap = makeUpwindTrack(wind, 52, 328);
  snap.legs = [{ type: "reach", startIdx: 0, endIdx: snap.points.length - 1 }];
  const samples = extractUpwindSamplesBetweenTacks(snap, "sub-a", wind);
  assert.ok(samples.length >= 10);
});

test("buildUpwindBetweenTackPointKinds colours port and starboard segments", () => {
  const wind = 10;
  const snap = makeUpwindTrack(wind, 52, 328);
  const kinds = buildUpwindBetweenTackPointKinds(snap.points, snap.tacks, snap.legs, wind);
  const portPts = kinds.filter((k) => k === "upwind_port").length;
  const stbdPts = kinds.filter((k) => k === "upwind_stbd").length;
  assert.ok(portPts > 0);
  assert.ok(stbdPts > 0);
  const fc = buildUpwindBetweenTackTrackSegmentFC(snap.points, snap.tacks, snap.legs, wind);
  assert.ok(fc.features.some((f) => f.properties?.kind === "upwind_port"));
  assert.ok(fc.features.some((f) => f.properties?.kind === "upwind_stbd"));
});

test("buildUpwindBetweenTackPointKinds colours all upwind legs when mark tacks are excluded", () => {
  const wind = 10;
  const twa = 42;
  const portCog = (wind + twa + 360) % 360;
  const stbdCog = (wind - twa + 360) % 360;
  const lap1 = makeUpwindTrack(wind, portCog, stbdCog, 1_700_000_000);
  const lap2 = makeUpwindTrack(wind, portCog, stbdCog, 1_700_000_400);
  const offset = lap1.points.length;
  const points = [...lap1.points, ...lap2.points.slice(1)];
  const tacks = [
    ...lap1.tacks,
    ...lap2.tacks.map((t) => ({
      ...t,
      turnIdx: (t.turnIdx ?? 0) + offset - 1,
      excludeFromStatsAndVMG: t.turnIdx === 29 || t.turnIdx === 14,
    })),
  ];
  const legs = [
    { type: "upwind", startIdx: 0, endIdx: offset - 1 },
    { type: "reach", startIdx: offset - 1, endIdx: offset },
    { type: "upwind", startIdx: offset, endIdx: points.length - 1 },
  ];
  const kinds = buildUpwindBetweenTackPointKinds(points, tacks, legs, wind);
  const lap2Kinds = kinds.slice(offset);
  assert.ok(
    lap2Kinds.filter((k) => k === "upwind_port" || k === "upwind_stbd").length > 10,
    "second upwind leg should be coloured",
  );
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
