"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildAllTacksVmgOverlayData } from "@/lib/sailing-analysis";
import type { AnalysisManoeuvre } from "@/lib/sailing-analysis/analysis-types";

export function VmgOverlayChart({
  points,
  manoeuvres,
  windDeg,
  title,
}: {
  points: { lat: number; lon: number; time?: number | null }[];
  manoeuvres: AnalysisManoeuvre[];
  windDeg: number;
  title: string;
}) {
  const data = buildAllTacksVmgOverlayData(points as never, manoeuvres as never, windDeg) as Record<
    string,
    number | null
  >[];

  if (!data.length || !manoeuvres.length) {
    return <p className="text-sm text-splice-ocean">Not enough data for {title.toLowerCase()} VMG overlay.</p>;
  }

  const colors = ["#6ec0ff", "#ff6b4a", "#4aff8a", "#a855f7", "#fbbf24", "#38bdf8"];

  return (
    <div className="rounded-xl border border-splice-sky p-4 dark:border-splice-ocean">
      <h4 className="mb-3 text-sm font-semibold text-splice-navy dark:text-splice-foam">{title}</h4>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="2 2" vertical={false} opacity={0.35} />
          <XAxis
            dataKey="tRel"
            type="number"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => (v === 0 ? "T" : `${v > 0 ? "+" : ""}${Math.round(v)}`)}
          />
          <YAxis tick={{ fontSize: 10 }} unit=" kt" width={36} />
          <Tooltip formatter={(v) => (v != null ? [`${v} kt`, "VMG"] : ["—", "VMG"])} />
          {manoeuvres.map((_, i) => (
            <Line
              key={i}
              type="monotone"
              dataKey={`vmg_${i}`}
              name={`#${i + 1}`}
              stroke={colors[i % colors.length]}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SpeedTimelineChart({
  speedTL,
  windTrace,
  t0,
  windDir,
}: {
  speedTL: { time: number; speed: number; cog?: number }[];
  windTrace?: { time: number; dir: number }[];
  t0?: number;
  windDir?: number | null;
}) {
  if (!speedTL?.length) {
    return <p className="text-sm text-splice-ocean">No speed timeline available.</p>;
  }

  const data = speedTL.map((d) => {
    const absT = (t0 ?? 0) + d.time;
    const wind =
      windTrace?.length && windDir != null
        ? windTrace.reduce((best, w) =>
            Math.abs(w.time - absT) < Math.abs(best.time - absT) ? w : best,
          ).dir
        : windDir;
    return { ...d, wind: wind != null ? Math.round(Number(wind)) : null };
  });

  return (
    <div className="rounded-xl border border-splice-sky p-4 dark:border-splice-ocean">
      <h4 className="mb-3 text-sm font-semibold text-splice-navy dark:text-splice-foam">Speed vs time</h4>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="2 2" vertical={false} opacity={0.35} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10 }}
            tickFormatter={(s) => `${Math.round(s / 60)}m`}
          />
          <YAxis tick={{ fontSize: 10 }} unit=" kt" width={36} />
          <Tooltip
            formatter={(v, name) =>
              name === "speed" ? [`${v} kt`, "Speed"] : [`${v}°`, "Wind from"]
            }
            labelFormatter={(s) => `${Math.round(Number(s))}s from start`}
          />
          <Line type="monotone" dataKey="speed" stroke="#00d4aa" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
