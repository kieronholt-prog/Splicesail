"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalysisManoeuvre } from "@/lib/sailing-analysis/analysis-types";

const MANEUVER_CHART_HALF_WINDOW_SEC = 10;

function formatMarkSplitRole(role?: string) {
  if (role === "before_closest") return "Manoeuvre centre before closest approach to mark";
  if (role === "after_closest") return "Manoeuvre centre after closest approach";
  if (role === "at_closest") return "Manoeuvre overlaps closest approach (mark arc + sailing turn combined)";
  return role ?? "";
}

export function ManeuverCard({
  m,
  index,
  embed = false,
}: {
  m: AnalysisManoeuvre;
  index: number;
  embed?: boolean;
}) {
  const qc = m.sideBef === "P" ? "#ff4a6a" : m.sideBef === "S" ? "#4aff8a" : "#8899b0";
  const cx = m.crossing;
  const ang = Math.round(Number(m.ch ?? 0));
  const scoreLabel = Number.isFinite(m.q) ? `${m.q}%` : "—";
  const refSrcLeg = m.type === "tack" && (m.refVmgSource === "leg" || m.performance?.ref_vmg_source === "leg");
  const refLabel = refSrcLeg ? "Leg VMG avg" : "1 min upwind avg";
  const markMan = m.excludeFromStatsAndVMG;
  const hasR = m.excludeMarkRadius === true;
  const hasIdx = m.excludeNearRoundingIdx === true;
  const exBadge = hasR && hasIdx
    ? "At mark · near rounding"
    : hasR
      ? "At mark"
      : hasIdx
        ? "Near rounding"
        : markMan
          ? "Rounding excluded"
          : "";

  const { chartData, mk } = useMemo(() => {
    const chart = m.perfChart;
    if (chart?.data?.length) {
      return { chartData: chart.data, mk: chart.markers ?? null };
    }
    return { chartData: [], mk: null };
  }, [m.perfChart]);

  const shell = embed
    ? "border-l-[3px] py-2 pl-3.5"
    : "rounded-xl border border-splice-sky p-4 dark:border-splice-ocean";

  return (
    <div
      className={shell}
      style={{ borderLeftColor: embed ? (markMan ? "#ff9500" : qc) : undefined }}
    >
      <div className="flex gap-3">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-mono text-lg font-extrabold"
          style={{ background: `${qc}22`, color: qc }}
        >
          {scoreLabel}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-splice-navy dark:text-splice-foam">
            <span>
              {m.type === "tack" ? "⬆ Tack" : "⬇ Gybe"}
              {!embed ? ` #${index + 1}` : ""}
            </span>
            {markMan && exBadge ? (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-200">
                {exBadge}
              </span>
            ) : null}
            {cx ? (
              <span
                className="rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold"
                style={{
                  color: cx === "P→S" ? "#ff4a6a" : cx === "S→P" ? "#4aff8a" : "#8899b0",
                  borderColor: cx === "P→S" ? "#ff4a6a55" : cx === "S→P" ? "#4aff8a55" : "#8899b055",
                }}
              >
                {cx}
              </span>
            ) : null}
          </div>

          {m.type === "tack" &&
          (Number.isFinite(Number(m.tackMeanVmgKts)) || Number.isFinite(Number(m.refUpwindWindowVmgKts))) ? (
            <div className="mt-2 rounded-lg border border-splice-sky/60 bg-splice-surface/40 px-3 py-2 text-xs dark:border-splice-ocean">
              <span className="text-splice-ocean">Tack VMG </span>
              <span className="font-mono font-bold text-splice-navy dark:text-splice-foam">
                {Number.isFinite(Number(m.tackMeanVmgKts)) ? `${Number(m.tackMeanVmgKts).toFixed(2)} kt` : "—"}
              </span>
              <span className="mx-2 text-splice-ocean">·</span>
              <span className="text-splice-ocean">{refLabel} </span>
              <span className="font-mono font-bold text-splice-blue">
                {Number.isFinite(Number(m.refUpwindWindowVmgKts))
                  ? `${Number(m.refUpwindWindowVmgKts).toFixed(2)} kt`
                  : "—"}
              </span>
            </div>
          ) : null}

          <p className="mt-2 font-mono text-sm font-semibold text-splice-blue">
            {m.type === "tack" ? "Tack" : "Gybe"} angle {ang}°
            {m.performance && Number.isFinite(Number(m.performance.turn_rate_deg_sec)) ? (
              <span className="ml-2 font-normal text-splice-ocean">
                · RoT {Number(m.performance.turn_rate_deg_sec).toFixed(2)}°/s
              </span>
            ) : null}
          </p>

          {m.markRounding ? (
            <div className="mt-2 border-t border-splice-sky/60 pt-2 text-[11px] leading-relaxed text-splice-ocean dark:border-splice-ocean">
              <span className="font-semibold text-amber-600 dark:text-amber-300">Mark rounding</span> ·{" "}
              {m.markRounding.mark}
              {m.markRounding.roundTack ? ` (${m.markRounding.roundTack})` : ""} · lap {m.markRounding.lap}
              <br />
              {formatMarkSplitRole(m.markRounding.splitRole)}
              <br />
              Turn in manoeuvre {m.markRounding.manoeuvrePortionDeg}° · mark arc est.{" "}
              {m.markRounding.markArcResidualDeg}°
            </div>
          ) : null}
        </div>

        {chartData.length > 0 ? (
          <div className="hidden w-36 shrink-0 sm:block">
            <p className="mb-1 text-center text-[7px] text-splice-ocean">VMG · T=wind cross</p>
            <ResponsiveContainer width="100%" height={52}>
              <ComposedChart data={chartData} margin={{ top: 2, right: 4, left: 0, bottom: 14 }}>
                <CartesianGrid strokeDasharray="2 2" vertical={false} opacity={0.35} />
                <XAxis
                  dataKey="tRel"
                  type="number"
                  domain={[-MANEUVER_CHART_HALF_WINDOW_SEC, MANEUVER_CHART_HALF_WINDOW_SEC]}
                  tick={{ fontSize: 8 }}
                  height={18}
                  tickFormatter={(v) => (v === 0 ? "T" : `${v > 0 ? "+" : ""}${Math.round(v)}`)}
                />
                <YAxis domain={["auto", "auto"]} hide width={0} />
                <Tooltip
                  formatter={(v) => (v != null && !Number.isNaN(Number(v)) ? [`${v} kt`, "VMG"] : ["—", "VMG"])}
                />
                <Line type="monotone" dataKey="vmg" stroke="#6ec0ff" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                {mk && Number.isFinite(Number(mk.tRel_turn_start)) ? (
                  <ReferenceLine x={Number(mk.tRel_turn_start)} stroke="#8899b0" strokeDasharray="4 3" />
                ) : null}
                <ReferenceLine x={0} stroke="#ffb84a" strokeWidth={1.2} />
                {mk && Number.isFinite(Number(mk.tRel_turn_end)) ? (
                  <ReferenceLine x={Number(mk.tRel_turn_end)} stroke="#8899b0" strokeDasharray="4 3" />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>
    </div>
  );
}
