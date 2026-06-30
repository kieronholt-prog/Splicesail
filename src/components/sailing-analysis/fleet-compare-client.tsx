"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import {
  compareAnalyses,
  formatTackSpeed,
  formatTwa,
  type CompareAnalysesResult,
  type CompareAnalysisInput,
  type CompareLegTypeSection,
} from "@/lib/sailing-analysis/compare-analyses";
import type { MobileFleetAnalysisPeer } from "@/lib/mobile/fleet-analyses";

type PeerOption = MobileFleetAnalysisPeer & { isMine?: boolean };

type Props = {
  groupId: string;
  seriesId: string;
  raceId: string;
  raceEntryId: string | null;
  windDirection: number | null;
  peers: PeerOption[];
  mySubmissionId: string | null;
  initialLeftId: string | null;
  initialRightId: string | null;
  loadPairAction: (leftId: string, rightId: string) => Promise<{
    left: CompareAnalysisInput;
    right: CompareAnalysisInput;
  } | null>;
};

function TackSection({
  title,
  leftSection,
  rightSection,
  leftLabel,
  rightLabel,
}: {
  title: string;
  leftSection: CompareLegTypeSection;
  rightSection: CompareLegTypeSection;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-splice-navy dark:text-splice-foam">
        {title}
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-splice-sky text-left text-xs uppercase dark:border-splice-navy-light">
              <th className="py-2 pr-2">Metric</th>
              <th className="py-2 pr-2 text-right text-emerald-800 dark:text-emerald-300">{leftLabel}</th>
              <th className="py-2 text-right text-amber-800 dark:text-amber-300">{rightLabel}</th>
            </tr>
          </thead>
          <tbody className="text-splice-navy dark:text-splice-foam">
            {(["port", "stbd"] as const).map((side) => (
              <Fragment key={side}>
                <tr className="bg-splice-surface/80 dark:bg-splice-navy/60">
                  <td colSpan={3} className="py-1.5 pl-1 text-xs font-semibold uppercase">
                    {side === "port" ? "Port tack" : "Starboard tack"}
                  </td>
                </tr>
                <tr key={`${side}-spd`} className="border-b border-splice-sky/50 dark:border-splice-navy-light/50">
                  <td className="py-2 pr-2">Avg speed</td>
                  <td className="py-2 pr-2 text-right font-mono">
                    {formatTackSpeed(leftSection[side])}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {formatTackSpeed(rightSection[side])}
                  </td>
                </tr>
                <tr key={`${side}-vmg`} className="border-b border-splice-sky/50 dark:border-splice-navy-light/50">
                  <td className="py-2 pr-2">VMG to wind</td>
                  <td className="py-2 pr-2 text-right font-mono">
                    {leftSection[side]?.vmgToWind != null
                      ? leftSection[side]!.vmgToWind!.toFixed(2)
                      : "—"}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {rightSection[side]?.vmgToWind != null
                      ? rightSection[side]!.vmgToWind!.toFixed(2)
                      : "—"}
                  </td>
                </tr>
                <tr className="border-b border-splice-sky/50 dark:border-splice-navy-light/50">
                  <td className="py-2 pr-2">Mean TWA</td>
                  <td className="py-2 pr-2 text-right font-mono">{formatTwa(leftSection[side])}</td>
                  <td className="py-2 text-right font-mono">{formatTwa(rightSection[side])}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function FleetCompareClient({
  groupId,
  seriesId,
  raceId,
  raceEntryId,
  windDirection,
  peers,
  mySubmissionId,
  initialLeftId,
  initialRightId,
  loadPairAction,
}: Props) {
  const options = useMemo(() => {
    const list: PeerOption[] = [...peers];
    if (mySubmissionId && !list.some((p) => p.submissionId === mySubmissionId)) {
      list.unshift({
        submissionId: mySubmissionId,
        userId: "",
        raceEntryId,
        sailNumber: "You",
        boatLabel: null,
        activityName: "Your track",
        durationSeconds: null,
        windDirection: null,
        finishPosition: null,
        elapsedSeconds: null,
        finishDisplay: "—",
        isMine: true,
      });
    }
    return list;
  }, [peers, mySubmissionId, raceEntryId]);

  const [leftId, setLeftId] = useState(initialLeftId ?? mySubmissionId ?? options[0]?.submissionId ?? "");
  const [rightId, setRightId] = useState(
    initialRightId ?? options.find((p) => p.submissionId !== leftId)?.submissionId ?? "",
  );
  const [compare, setCompare] = useState<CompareAnalysesResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCompare() {
    if (!leftId || !rightId || leftId === rightId) {
      setError("Pick two different boats.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const pair = await loadPairAction(leftId, rightId);
      if (!pair) {
        setError("Could not load analyses.");
        setCompare(null);
        return;
      }
      setCompare(compareAnalyses(pair.left, pair.right));
    } catch {
      setError("Compare failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-splice-navy-light dark:text-splice-water">
        Collated fleet tracks on the same race course
        {windDirection != null ? ` · RO wind ${Math.round(windDirection)}°` : ""}
      </p>

      {options.length < 2 ? (
        <p className="mt-4 text-sm text-splice-navy-light dark:text-splice-water">
          Need at least two ready collated tracks in your fleet (with sharing enabled).
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-splice-navy-light dark:text-splice-water">Boat A</span>
              <select
                className="mt-1 w-full rounded-lg border border-splice-sky bg-white px-3 py-2 dark:border-splice-navy-light dark:bg-splice-navy"
                value={leftId}
                onChange={(e) => setLeftId(e.target.value)}
              >
                {options.map((o) => (
                  <option key={o.submissionId} value={o.submissionId}>
                    {o.isMine ? "You" : `#${o.sailNumber}`}
                    {o.finishDisplay !== "—" ? ` · ${o.finishDisplay}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-splice-navy-light dark:text-splice-water">Boat B</span>
              <select
                className="mt-1 w-full rounded-lg border border-splice-sky bg-white px-3 py-2 dark:border-splice-navy-light dark:bg-splice-navy"
                value={rightId}
                onChange={(e) => setRightId(e.target.value)}
              >
                {options.map((o) => (
                  <option key={o.submissionId} value={o.submissionId}>
                    {o.isMine ? "You" : `#${o.sailNumber}`}
                    {o.finishDisplay !== "—" ? ` · ${o.finishDisplay}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void runCompare()}
            className="mt-4 rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-splice-foam dark:text-splice-navy"
          >
            {busy ? "Comparing…" : "Compare"}
          </button>
        </>
      )}

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          {error}
        </p>
      ) : null}

      {compare ? (
        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Overall</h2>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {compare.overall.map((row) => (
                <tr key={row.metric} className="border-b border-splice-sky/50 dark:border-splice-navy-light/50">
                  <td className="py-2 pr-2">{row.metric}</td>
                  <td className="py-2 pr-2 text-right font-mono">{row.left}</td>
                  <td className="py-2 text-right font-mono">{row.right}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <TackSection
            title="Upwind"
            leftSection={compare.upwind.left}
            rightSection={compare.upwind.right}
            leftLabel={compare.left.label}
            rightLabel={compare.right.label}
          />
          <TackSection
            title="Reach"
            leftSection={compare.reach.left}
            rightSection={compare.reach.right}
            leftLabel={compare.left.label}
            rightLabel={compare.right.label}
          />
          <TackSection
            title="Downwind"
            leftSection={compare.downwind.left}
            rightSection={compare.downwind.right}
            leftLabel={compare.left.label}
            rightLabel={compare.right.label}
          />

          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide">By leg</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left uppercase text-splice-navy-light dark:text-splice-water">
                    <th className="py-1 pr-2">Leg</th>
                    <th className="py-1 pr-2">Route</th>
                    <th className="py-1 pr-2 text-right">A time</th>
                    <th className="py-1 pr-2 text-right">B time</th>
                    <th className="py-1 text-right">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.legs.map((leg) => (
                    <tr key={String(leg.legNo)} className="border-t border-splice-sky/40 dark:border-splice-navy-light/40">
                      <td className="py-1.5 pr-2">{leg.legNo}</td>
                      <td className="py-1.5 pr-2">{leg.route}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">
                        {leg.left.durationSec != null
                          ? `${Math.floor(leg.left.durationSec / 60)}:${String(Math.floor(leg.left.durationSec % 60)).padStart(2, "0")}`
                          : "—"}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-mono">
                        {leg.right.durationSec != null
                          ? `${Math.floor(leg.right.durationSec / 60)}:${String(Math.floor(leg.right.durationSec % 60)).padStart(2, "0")}`
                          : "—"}
                      </td>
                      <td className="py-1.5 text-right">{leg.deltaLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      <p className="mt-8 text-xs text-splice-navy-light dark:text-splice-water">
        <Link
          href={`/groups/${groupId}/series/${seriesId}/races/${raceId}/track-analysis`}
          className="underline"
        >
          RO track analysis
        </Link>
        {raceEntryId ? (
          <>
            {" · "}
            <Link
              href={`/groups/${groupId}/series/${seriesId}/races/${raceId}/entries/${raceEntryId}/context`}
              className="underline"
            >
              Race context
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
