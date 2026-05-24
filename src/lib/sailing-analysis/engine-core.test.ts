import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGPX, parseFIT, runAnalysis, DETECTION_DEFAULTS } from "./engine-core";

const sampleGpx = `<?xml version="1.0"?>
<gpx><trk><trkseg>
<trkpt lat="50.842" lon="-1.305"><time>2026-05-01T17:00:00Z</time></trkpt>
<trkpt lat="50.843" lon="-1.306"><time>2026-05-01T17:00:30Z</time></trkpt>
<trkpt lat="50.844" lon="-1.307"><time>2026-05-01T17:01:00Z</time></trkpt>
</trkseg></trk></gpx>`;

test("parseGPX extracts track points", () => {
  const pts = parseGPX(sampleGpx);
  assert.equal(pts.length, 3);
  assert.ok(pts[0].lat > 50);
  assert.ok(Number.isFinite(pts[0].time));
});

test("runAnalysis returns null for short tracks", () => {
  const pts = parseGPX(sampleGpx);
  assert.equal(runAnalysis(pts, null, [], 1, [], DETECTION_DEFAULTS), null);
});

test("parseFIT accepts empty buffer without throw", () => {
  const buf = new ArrayBuffer(12);
  const view = new DataView(buf);
  view.setUint8(0, 12);
  view.setUint32(4, 0, true);
  const pts = parseFIT(buf);
  assert.ok(Array.isArray(pts));
});
