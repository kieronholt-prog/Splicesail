import { describe, expect, it } from "vitest";
import { compareAnalyses } from "./compare-analyses";

describe("compareAnalyses", () => {
  it("builds overall and leg deltas", () => {
    const left = {
      label: "1234",
      stats: { duration: 3600, totalDist: 9260, tackCount: 12, gybeCount: 2 },
      legSummary: [{ legNo: 1, from: "SF", to: "1", type: "upwind", duration: 600 }],
      windDirection: 180,
    };
    const right = {
      label: "5678",
      stats: { duration: 3700, totalDist: 9400, tackCount: 10, gybeCount: 3 },
      legSummary: [{ legNo: 1, from: "SF", to: "1", type: "upwind", duration: 650 }],
      windDirection: 182,
    };
    const result = compareAnalyses(left, right);
    expect(result.overall[0]?.left).toBe("1:00:00");
    expect(result.legs[0]?.deltaLabel).toContain("slower");
  });
});
