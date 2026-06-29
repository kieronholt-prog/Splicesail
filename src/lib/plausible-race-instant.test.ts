import { describe, expect, it } from "vitest";
import {
  isPlausibleRaceInstantMs,
  resolveRaceDayYmd,
} from "@/lib/plausible-race-instant";

describe("plausible-race-instant", () => {
  it("rejects unix epoch (finite zero)", () => {
    expect(isPlausibleRaceInstantMs(0)).toBe(false);
    expect(isPlausibleRaceInstantMs(new Date("1970-01-01T00:00:00.000Z").getTime())).toBe(false);
  });

  it("accepts modern instants", () => {
    expect(isPlausibleRaceInstantMs(Date.UTC(2026, 5, 27, 14, 30))).toBe(true);
  });

  it("resolves race day from fleet signal when schedule is corrupt", () => {
    const ymd = resolveRaceDayYmd(
      "1970-01-01T00:00:00.000Z",
      "Europe/London",
      ["2026-06-27T13:00:00.000Z"],
    );
    expect(ymd).toBe("2026-06-27");
  });
});
