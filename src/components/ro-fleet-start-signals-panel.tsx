"use client";

import {
  clubWallHmOnYmdToUtcMs,
  clubWallYmdFromUtcMs,
  utcMsToClubWallHm,
} from "@/lib/club-zoned";
import {
  nextStartSequenceMilestone,
  startSequenceMilestonesUtcMs,
} from "@/lib/start-sequence-flags";
import {
  marineFlagKeyFromClassFlag,
  marineFlagKeyFromIcsAndName,
  pennantCharForDisplay,
} from "@/lib/marine-signal-flags";
import { postponementDownShiftMinutes, startSequenceLabel } from "@/lib/series-start-sequence";
import { MarineSignalFlagImg } from "@/components/marine-signal-flag-img";
import { InfoHint } from "@/components/ui/info-hint";
import { updateRaceFleetStartSignalAction } from "@/app/actions/ro-race-start";
import { formatClubClockDdMmmYyyyHm } from "@/lib/club-display-format";
import { wallTimeMs } from "@/lib/wall-time";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type RoFleetStartRow = {
  id: string;
  name: string;
  startOffsetMinutes: number;
  /** RO-amended fleet start from DB; when set, overrides schedule + offset for this fleet. */
  startSignalAtIso?: string | null;
  flagMode: "ics" | "image_url";
  icsSignal: string | null;
  flagImageUrl: string | null;
  clubClassFlag: string | null;
};

type Props = {
  groupId: string;
  seriesId: string;
  raceId: string;
  scheduledAtIso: string;
  displayTimeZone: string;
  startSequenceCode: string | null | undefined;
  fleets: RoFleetStartRow[];
};

/** Same canvas for P prep and class pennants in the main sequence strip */
const TIMELINE_FLAG_SLOT =
  "h-[5.25rem] w-[4.5rem] max-h-[5.25rem] max-w-[4.5rem] shrink-0 object-contain";

function storageKey(raceId: string) {
  return `ro-fleet-signals-v1:${raceId}`;
}

type PersistedV1 = {
  v: 1;
  pausedAt: Record<string, number>;
  recallRestart: Record<string, boolean>;
};

function formatHms(totalSeconds: number) {
  const abs = Math.abs(Math.floor(totalSeconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatClockNow(epochMs: number, timeZone: string) {
  return formatClubClockDdMmmYyyyHm(epochMs, timeZone);
}

function buildInitialTargets(scheduledAtIso: string, fleets: RoFleetStartRow[]): Record<string, number> {
  const base = new Date(scheduledAtIso).getTime();
  const out: Record<string, number> = {};
  if (!Number.isFinite(base)) return out;
  for (const f of fleets) {
    if (f.startSignalAtIso) {
      const amended = new Date(f.startSignalAtIso).getTime();
      if (Number.isFinite(amended)) {
        out[f.id] = amended;
        continue;
      }
    }
    const off =
      f.startOffsetMinutes != null && Number.isFinite(Number(f.startOffsetMinutes))
        ? Number(f.startOffsetMinutes)
        : 0;
    out[f.id] = base + off * 60_000;
  }
  return out;
}

function loadPersisted(raceId: string): PersistedV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(raceId));
    if (!raw) return null;
    const p = JSON.parse(raw) as PersistedV1;
    if (p?.v !== 1) return null;
    return p;
  } catch {
    return null;
  }
}

function savePersisted(raceId: string, data: Omit<PersistedV1, "v"> & { v?: 1 }) {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedV1 = {
      v: 1,
      pausedAt: data.pausedAt,
      recallRestart: data.recallRestart,
    };
    window.localStorage.setItem(storageKey(raceId), JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AC =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  return audioCtx;
}

const COUNTDOWN_TICK_BEEP_S = 0.3;
const COUNTDOWN_TICK_FREQUENCY_HZ = 1400;

/** One countdown second marker (last 10s before each signal); shorter, higher-pitched than the signal horn. */
function playCountdownTickBeep() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state !== "running") void ctx.resume();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = COUNTDOWN_TICK_FREQUENCY_HZ;
  o.connect(g);
  g.connect(ctx.destination);
  const t0 = ctx.currentTime;
  const dur = COUNTDOWN_TICK_BEEP_S;
  const attack = 0.015;
  const release = 0.04;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.1, t0 + attack);
  g.gain.setValueAtTime(0.1, t0 + dur - release);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.start(t0);
  o.stop(t0 + dur);
}

/** Continuous tone at each signal instant (countdown reaches zero). */
function playSignalInstantBeep() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state !== "running") void ctx.resume();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = 880;
  o.connect(g);
  g.connect(ctx.destination);
  const t0 = ctx.currentTime;
  const dur = 2;
  const attack = 0.02;
  const release = 0.06;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.09, t0 + attack);
  g.gain.setValueAtTime(0.09, t0 + dur - release);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.start(t0);
  o.stop(t0 + dur);
}

function ClassFlagTimeline({ fleet }: { fleet: RoFleetStartRow }) {
  const clubKey = marineFlagKeyFromClassFlag(fleet.clubClassFlag);
  if (clubKey) {
    return <MarineSignalFlagImg flagKey={clubKey} alt="" className={TIMELINE_FLAG_SLOT} />;
  }
  if (fleet.flagMode === "image_url" && fleet.flagImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- club-hosted pennants
      <img src={fleet.flagImageUrl} alt="" className={TIMELINE_FLAG_SLOT} />
    );
  }
  const svgKey = marineFlagKeyFromIcsAndName(fleet.icsSignal, fleet.name);
  if (svgKey) {
    return <MarineSignalFlagImg flagKey={svgKey} alt="" className={TIMELINE_FLAG_SLOT} />;
  }
  const ch = pennantCharForDisplay(fleet.icsSignal, fleet.name);
  return (
    <div
      className={`flex ${TIMELINE_FLAG_SLOT} items-center justify-center rounded-sm border-2 border-splice-navy-light bg-amber-300 shadow-sm dark:border-splice-water dark:bg-amber-400/90`}
    >
      <span className="font-mono text-2xl font-bold leading-none text-splice-navy">{ch}</span>
    </div>
  );
}

/** Prep (P) uses the same slot as class flags so sizes match. */
function PrepFlagTimeline() {
  return <MarineSignalFlagImg flagKey="p" alt="" className={TIMELINE_FLAG_SLOT} />;
}

/** Small preview in the “Next” aside (prep P vs class pennant). */
function NextFlagMini({ fleet, showClass }: { fleet: RoFleetStartRow; showClass: boolean }) {
  if (!showClass) {
    return <MarineSignalFlagImg flagKey="p" alt="" className="h-10 w-10 shrink-0 object-contain" />;
  }
  const clubKey = marineFlagKeyFromClassFlag(fleet.clubClassFlag);
  if (clubKey) {
    return <MarineSignalFlagImg flagKey={clubKey} alt="" className="h-10 w-10 shrink-0 object-contain" />;
  }
  if (fleet.flagMode === "image_url" && fleet.flagImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- club-hosted pennants
      <img src={fleet.flagImageUrl} alt="" className="h-10 w-10 shrink-0 object-contain" />
    );
  }
  const svgKey = marineFlagKeyFromIcsAndName(fleet.icsSignal, fleet.name);
  if (svgKey) {
    return <MarineSignalFlagImg flagKey={svgKey} alt="" className="h-10 w-10 shrink-0 object-contain" />;
  }
  const ch = pennantCharForDisplay(fleet.icsSignal, fleet.name);
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-splice-ocean bg-amber-200 text-sm font-bold text-splice-navy dark:border-splice-water dark:bg-amber-400/90">
      {ch}
    </div>
  );
}

function StartSequenceTimeline({
  targetMs,
  code,
  effMs,
  fleet,
}: {
  targetMs: number;
  code: string | null | undefined;
  effMs: number;
  fleet: RoFleetStartRow;
}) {
  const sorted = [...startSequenceMilestonesUtcMs(targetMs, code)].sort((a, b) => a.t - b.t);
  const nextIdx = sorted.findIndex((ev) => ev.t > effMs);
  return (
    <div className="relative flex min-h-[6.25rem] min-w-0 flex-col justify-center">
      <div
        className="pointer-events-none absolute left-[6%] right-[6%] top-[38%] z-0 h-px bg-splice-water dark:bg-splice-ocean"
        aria-hidden
      />
      <div className="relative z-10 flex min-h-[6.25rem] w-full min-w-0 flex-1 items-stretch">
        {sorted.map((ev, idx) => {
          const done = effMs >= ev.t;
          const isNext = idx === nextIdx;
          const isClass = ev.kind === "class_hoist" || ev.kind === "class_lower";
          const hoist = ev.kind === "class_hoist" || ev.kind === "prep_hoist";
          return (
            <div
              key={`${ev.kind}-${ev.t}`}
              className={`flex min-h-0 min-w-0 flex-1 flex-col border-r border-splice-sky last:border-r-0 dark:border-splice-ocean ${
                done ? "opacity-40" : ""
              } ${isNext ? "ring-2 ring-inset ring-amber-500 dark:ring-amber-400" : ""}`}
            >
              <div className="flex min-h-0 flex-1 items-center justify-center px-0.5 pt-0.5">
                {isClass ? <ClassFlagTimeline fleet={fleet} /> : <PrepFlagTimeline />}
              </div>
              <div className="flex shrink-0 justify-center pb-0.5 pt-0.5">
                <span className="text-base font-bold leading-none text-splice-navy dark:text-splice-foam" aria-hidden>
                  {hoist ? "↑" : "↓"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NextSequenceChangeAside({
  targetMs,
  code,
  effMs,
  fleet,
}: {
  targetMs: number;
  code: string | null | undefined;
  effMs: number;
  fleet: RoFleetStartRow;
}) {
  const next = nextStartSequenceMilestone(targetMs, code, effMs);
  const sec = next != null ? (next.t - effMs) / 1000 : Number.NaN;
  const show = next != null && sec > 0 && sec <= 60;

  const asideShell =
    "flex min-h-[6.25rem] w-[9rem] max-w-[36vw] shrink-0 flex-col items-center justify-center gap-1 rounded-md border-2 px-2 py-1.5 sm:w-[9.25rem] sm:max-w-none";

  if (!show || next == null) {
    return (
      <div
        className={`${asideShell} border-dashed border-splice-water bg-splice-surface/90 text-center dark:border-splice-ocean dark:bg-splice-navy/40`}
        aria-label="Next sequence change (nothing within one minute)"
      >
        <p className="text-xs font-bold uppercase tracking-wide text-splice-ocean dark:text-splice-sky">Next</p>
        <p className="text-[10px] leading-tight text-splice-blue dark:text-splice-water">Outside 1 min</p>
      </div>
    );
  }

  const hoist = next.kind === "class_hoist" || next.kind === "prep_hoist";
  const isClass = next.kind === "class_hoist" || next.kind === "class_lower";

  return (
    <div
      className={`${asideShell} border-splice-water bg-splice-surface shadow-sm dark:border-splice-blue dark:bg-splice-navy/50`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-splice-ocean dark:text-splice-sky">Next</p>
      <div className="flex items-center gap-2">
        <NextFlagMini fleet={fleet} showClass={isClass} />
        <div className="flex min-w-0 flex-col items-start gap-0.5 leading-none">
          <span className="text-xs font-semibold text-splice-navy-light dark:text-splice-foam">{isClass ? "Class" : "Prep"}</span>
          <span className="text-2xl font-bold text-splice-navy dark:text-splice-surface">{hoist ? "↑" : "↓"}</span>
        </div>
      </div>
      <p className="text-sm font-semibold tabular-nums text-splice-navy dark:text-splice-surface">{formatHms(sec)}</p>
    </div>
  );
}

export function RoFleetStartSignalsPanel({
  groupId,
  seriesId,
  raceId,
  scheduledAtIso,
  displayTimeZone,
  startSequenceCode,
  fleets,
}: Props) {
  const router = useRouter();
  const baseMs = useMemo(() => new Date(scheduledAtIso).getTime(), [scheduledAtIso]);
  const raceDayYmd = useMemo(() => {
    if (!Number.isFinite(baseMs)) return "";
    return clubWallYmdFromUtcMs(baseMs, displayTimeZone);
  }, [baseMs, displayTimeZone]);

  const postponeShiftMs = useMemo(
    () => postponementDownShiftMinutes(startSequenceCode) * 60_000,
    [startSequenceCode],
  );

  const initialTargets = useMemo(() => buildInitialTargets(scheduledAtIso, fleets), [scheduledAtIso, fleets]);

  const [now, setNow] = useState(() => wallTimeMs());
  const [targets, setTargets] = useState<Record<string, number>>(() => initialTargets);
  const [pausedAt, setPausedAt] = useState<Record<string, number>>({});
  const [recallRestart, setRecallRestart] = useState<Record<string, boolean>>({});
  const [hmDraft, setHmDraft] = useState<Record<string, string>>({});
  const [hmError, setHmError] = useState<Record<string, string>>({});
  const [persistError, setPersistError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  /** Drives countdown beeps at 250ms so last-10s ticks are not missed when display `now` is 1Hz. */
  const [audioTick, setAudioTick] = useState(0);

  const recallDialogRef = useRef<HTMLDialogElement>(null);
  const [recallFleetId, setRecallFleetId] = useState<string | null>(null);
  const [recallHmInput, setRecallHmInput] = useState("");
  const [recallError, setRecallError] = useState<string | null>(null);

  const beepStateRef = useRef<Record<string, { lastCeil: number; longPlayed: boolean }>>({});

  const fleetsSig = useMemo(
    () =>
      fleets
        .map(
          (x) =>
            `${x.id}:${x.startOffsetMinutes}:${x.startSignalAtIso ?? ""}:${x.flagMode}:${x.icsSignal ?? ""}:${x.flagImageUrl ?? ""}:${x.clubClassFlag ?? ""}`,
        )
        .join("|"),
    [fleets],
  );

  const persistFleetStart = useCallback(
    async (fleetId: string, ms: number) => {
      setPersistError(null);
      const res = await updateRaceFleetStartSignalAction({
        group_id: groupId,
        series_id: seriesId,
        race_id: raceId,
        fleet_id: fleetId,
        start_at_iso: new Date(ms).toISOString(),
      });
      if ("error" in res) {
        setPersistError(res.error);
        return;
      }
      router.refresh();
    },
    [groupId, seriesId, raceId, router],
  );

  useEffect(() => {
    const id = window.setInterval(() => setNow(wallTimeMs()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const prime = () => {
      void getAudioContext()?.resume();
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
    window.addEventListener("pointerdown", prime);
    window.addEventListener("keydown", prime);
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const id = window.setInterval(() => setAudioTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const nowMs = wallTimeMs();
    for (const f of fleets) {
      const tid = f.id;
      const target = targets[tid];
      if (target == null || !Number.isFinite(target)) continue;
      const eff = pausedAt[tid] != null && Number.isFinite(pausedAt[tid]!) ? pausedAt[tid]! : nowMs;
      const milestones = startSequenceMilestonesUtcMs(target, startSequenceCode);
      for (const ev of milestones) {
        const key = `${tid}:${ev.kind}:${ev.t}`;
        const remain = (ev.t - eff) / 1000;
        const st = beepStateRef.current[key] ?? {
          lastCeil: Number.NaN,
          longPlayed: false,
        };

        if (remain <= 0) {
          if (!st.longPlayed) {
            playSignalInstantBeep();
            beepStateRef.current[key] = { lastCeil: Number.NaN, longPlayed: true };
          }
          continue;
        }

        // Whole-second markers for the last 10s: ceil(remain) is 10…1 in (9,10]…(0,1].
        // Using floor(remain) missed the final bucket (0 whilst remain>0), which made the gap before the gun ~2s.
        const c = Math.ceil(remain);
        if (c > 10) {
          beepStateRef.current[key] = { lastCeil: c, longPlayed: false };
          continue;
        }
        if (c >= 1) {
          if (st.lastCeil !== c) {
            playCountdownTickBeep();
          }
          beepStateRef.current[key] = { lastCeil: c, longPlayed: false };
        } else {
          beepStateRef.current[key] = { lastCeil: c, longPlayed: false };
        }
      }
    }
  }, [audioTick, targets, pausedAt, fleets, startSequenceCode, hydrated]);

  /** Merge persisted local timings after mount — defaults match SSR/client first paint, then hydrate from localStorage. */
  /* eslint-disable react-hooks/set-state-in-effect -- intentional one-shot client hydration without snapshot mismatch */
  useEffect(() => {
    const p = loadPersisted(raceId);
    const nextTargets = buildInitialTargets(scheduledAtIso, fleets);
    setTargets(nextTargets);
    setPausedAt(p?.pausedAt && typeof p.pausedAt === "object" ? { ...p.pausedAt } : {});
    setRecallRestart(p?.recallRestart && typeof p.recallRestart === "object" ? { ...p.recallRestart } : {});
    const drafts: Record<string, string> = {};
    for (const id of Object.keys(nextTargets)) {
      drafts[id] = utcMsToClubWallHm(nextTargets[id], displayTimeZone);
    }
    setHmDraft(drafts);
    setHmError({});
    /** Do not replay 2s signal horns for milestones already passed when the panel opens (e.g. race underway). */
    const seedNow = wallTimeMs();
    const seeded: Record<string, { lastCeil: number; longPlayed: boolean }> = {};
    for (const tid of Object.keys(nextTargets)) {
      const target = nextTargets[tid];
      if (target == null || !Number.isFinite(target)) continue;
      const fr = p?.pausedAt?.[tid];
      const eff =
        fr != null && typeof fr === "number" && Number.isFinite(fr) ? fr : seedNow;
      for (const ev of startSequenceMilestonesUtcMs(target, startSequenceCode)) {
        if (eff >= ev.t) {
          seeded[`${tid}:${ev.kind}:${ev.t}`] = { lastCeil: Number.NaN, longPlayed: true };
        }
      }
    }
    beepStateRef.current = seeded;
    setHydrated(true);
  }, [raceId, scheduledAtIso, displayTimeZone, fleetsSig, startSequenceCode]);

  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    savePersisted(raceId, { pausedAt, recallRestart });
  }, [hydrated, raceId, pausedAt, recallRestart]);

  const effNowFor = useCallback(
    (fleetId: string) => {
      const fr = pausedAt[fleetId];
      return fr != null && Number.isFinite(fr) ? fr : now;
    },
    [pausedAt, now],
  );

  const openRecallDialog = (fleetId: string) => {
    const t = targets[fleetId];
    setRecallFleetId(fleetId);
    setRecallHmInput(t != null ? utcMsToClubWallHm(t, displayTimeZone) : "");
    setRecallError(null);
    recallDialogRef.current?.showModal();
  };

  const confirmRecallRestart = () => {
    if (!recallFleetId || !raceDayYmd) {
      recallDialogRef.current?.close();
      return;
    }
    const ms = clubWallHmOnYmdToUtcMs(recallHmInput, raceDayYmd, displayTimeZone);
    if (ms == null || !Number.isFinite(ms)) {
      setRecallError("Enter a valid time as HH:MM (club clock, race day).");
      return;
    }
    setTargets((prev) => ({ ...prev, [recallFleetId]: ms }));
    setRecallRestart((prev) => ({ ...prev, [recallFleetId]: false }));
    setPausedAt((prev) => {
      const n = { ...prev };
      delete n[recallFleetId];
      return n;
    });
    setHmDraft((prev) => ({ ...prev, [recallFleetId]: utcMsToClubWallHm(ms, displayTimeZone) }));
    void persistFleetStart(recallFleetId, ms);
    setRecallError(null);
    recallDialogRef.current?.close();
    setRecallFleetId(null);
  };

  const applyHm = (fleetId: string) => {
    if (!raceDayYmd) return;
    const raw = hmDraft[fleetId] ?? "";
    const ms = clubWallHmOnYmdToUtcMs(raw, raceDayYmd, displayTimeZone);
    if (ms == null || !Number.isFinite(ms)) {
      setHmError((e) => ({ ...e, [fleetId]: "Invalid HH:MM" }));
      return;
    }
    setHmError((e) => {
      const n = { ...e };
      delete n[fleetId];
      return n;
    });
    setTargets((prev) => ({ ...prev, [fleetId]: ms }));
    setPausedAt((prev) => {
      const n = { ...prev };
      delete n[fleetId];
      return n;
    });
    setRecallRestart((prev) => ({ ...prev, [fleetId]: false }));
    void persistFleetStart(fleetId, ms);
  };

  if (!Number.isFinite(baseMs) || fleets.length === 0) {
    return (
      <p className="rounded-xl border border-splice-sky bg-white px-4 py-3 text-sm text-splice-ocean dark:border-splice-navy-light dark:bg-splice-navy dark:text-splice-water">
        No valid schedule or fleets — start signal panel unavailable.
      </p>
    );
  }

  if (!hydrated) {
    return (
      <div className="rounded-xl border border-splice-sky bg-splice-surface px-5 py-8 text-center text-sm text-splice-ocean dark:bg-splice-navy dark:text-splice-water">
        Loading start signals…
      </div>
    );
  }

  const postponementMin = postponementDownShiftMinutes(startSequenceCode);

  return (
    <section
      className="rounded-xl border border-splice-sky bg-white p-4 shadow-sm dark:border-splice-ocean dark:bg-splice-navy"
      aria-live="polite"
      onPointerDownCapture={() => {
        void getAudioContext()?.resume();
      }}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-splice-blue dark:text-splice-water">Start signals</p>
      <p className="mt-1 text-xs text-splice-ocean dark:text-splice-water">
        <strong className="font-medium text-splice-navy-light dark:text-splice-sky">HH:MM</strong> club · {raceDayYmd} ·{" "}
        {displayTimeZone}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-splice-blue dark:text-splice-water">
        <span>
          Sequence <strong className="text-splice-navy-light dark:text-splice-sky">{startSequenceLabel(startSequenceCode)}</strong>
        </span>
        <span>
          Postponement down <strong className="text-splice-navy-light dark:text-splice-sky">+{postponementMin} min</strong>
        </span>
      </div>
      {persistError ? (
        <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:bg-red-950/50 dark:text-red-200" role="alert">
          {persistError}
        </p>
      ) : null}

      <div className="mt-3 rounded-lg border border-splice-sky bg-splice-surface px-3 py-2 dark:border-splice-ocean dark:bg-splice-navy/50">
        <p className="text-[10px] font-medium uppercase tracking-wide text-splice-blue dark:text-splice-water">
          Now · {displayTimeZone}
        </p>
        <p className="text-lg font-semibold tabular-nums tracking-tight text-splice-navy dark:text-splice-surface">
          {formatClockNow(now, displayTimeZone)}
        </p>
      </div>

      <ul className="mt-3 space-y-2">
        {fleets.map((f, fleetIndex) => {
          const tid = f.id;
          const target = targets[tid];
          if (target == null || !Number.isFinite(target)) return null;

          const eff = effNowFor(tid);
          const deltaSec = (target - eff) / 1000;
          const isFuture = deltaSec > 0;
          const paused = pausedAt[tid] != null;
          const recall = !!recallRestart[tid];
          const started = now >= target;

          return (
            <li key={tid} className="rounded-lg border border-splice-sky px-2 py-2 dark:border-splice-ocean">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-splice-navy dark:text-splice-surface">{f.name}</p>
                <span className="shrink-0 text-[10px] text-splice-blue dark:text-splice-water">+{f.startOffsetMinutes}m</span>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <div className="flex shrink-0 items-center gap-1">
                  <label className="sr-only" htmlFor={`ro-start-${tid}`}>
                    Start time HH:MM club
                  </label>
                  <input
                    id={`ro-start-${tid}`}
                    type="text"
                    inputMode="numeric"
                    placeholder="14:30"
                    value={hmDraft[tid] ?? ""}
                    onChange={(e) =>
                      setHmDraft((d) => ({
                        ...d,
                        [tid]: e.target.value,
                      }))
                    }
                    className="w-[4.25rem] rounded border border-splice-water bg-white px-1.5 py-0.5 text-xs tabular-nums text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-surface"
                  />
                  <button
                    type="button"
                    onClick={() => applyHm(tid)}
                    className="rounded border border-splice-water bg-splice-foam px-2 py-0.5 text-[10px] font-medium text-splice-navy dark:border-splice-ocean dark:bg-splice-navy-light dark:text-splice-foam"
                  >
                    Apply
                  </button>
                  {fleetIndex === 0 ? (
                    <InfoHint label="About Apply">
                      <p>
                        Apply saves the fleet start to the series schedule (first fleet updates the race start time).
                      </p>
                    </InfoHint>
                  ) : null}
                </div>

                <div className="min-w-0 flex-1 text-center">
                  {isFuture ? (
                    <p className="text-lg font-semibold tabular-nums leading-tight text-splice-navy dark:text-splice-surface">
                      −{formatHms(deltaSec)}
                    </p>
                  ) : (
                    <p className="text-lg font-semibold tabular-nums leading-tight text-splice-navy dark:text-splice-surface">
                      +{formatHms((now - target) / 1000)}
                    </p>
                  )}
                  {paused ? (
                    <span className="text-[9px] font-medium text-amber-800 dark:text-amber-200">Postponed</span>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {!paused && isFuture && !recall ? (
                    <button
                      type="button"
                      onClick={() => setPausedAt((p) => ({ ...p, [tid]: now }))}
                      className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-950 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100"
                    >
                      Postpone
                    </button>
                  ) : null}
                  {paused ? (
                    <button
                      type="button"
                      title={`Adds ${postponementMin} min to this fleet start.`}
                      onClick={() => {
                        let nextT = 0;
                        setTargets((prev) => {
                          nextT = prev[tid] + postponeShiftMs;
                          return { ...prev, [tid]: nextT };
                        });
                        setPausedAt((p) => {
                          const n = { ...p };
                          delete n[tid];
                          return n;
                        });
                        setHmDraft((d) => ({ ...d, [tid]: utcMsToClubWallHm(nextT, displayTimeZone) }));
                        void persistFleetStart(tid, nextT);
                      }}
                      className="rounded bg-splice-navy px-2 py-0.5 text-[10px] font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
                    >
                      Down +{postponementMin}m
                    </button>
                  ) : null}
                  {started && !recall ? (
                    <button
                      type="button"
                      onClick={() => setRecallRestart((r) => ({ ...r, [tid]: true }))}
                      className="rounded border border-red-300 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
                    >
                      Recall
                    </button>
                  ) : null}
                  {recall ? (
                    <button
                      type="button"
                      onClick={() => openRecallDialog(tid)}
                      className="rounded bg-splice-navy px-2 py-0.5 text-[10px] font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
                    >
                      Restart
                    </button>
                  ) : null}
                </div>
              </div>

              {hmError[tid] ? (
                <p className="mt-1 text-[10px] text-red-700 dark:text-red-300">{hmError[tid]}</p>
              ) : null}

              <div className="mt-1.5 grid min-h-[6.25rem] min-w-0 grid-cols-1 gap-2 border-t border-splice-foam pt-1.5 min-[480px]:grid-cols-[minmax(0,1fr)_auto] dark:border-splice-navy-light">
                <div className="min-w-0 overflow-x-auto">
                  <StartSequenceTimeline
                    targetMs={target}
                    code={startSequenceCode}
                    effMs={eff}
                    fleet={f}
                  />
                </div>
                <div className="flex min-w-0 justify-center min-[480px]:justify-end">
                  <NextSequenceChangeAside targetMs={target} code={startSequenceCode} effMs={eff} fleet={f} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <dialog
        ref={recallDialogRef}
        className="max-w-md rounded-xl border border-splice-sky bg-white p-5 text-splice-navy shadow-xl dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
        onClose={() => {
          setRecallFleetId(null);
          setRecallError(null);
        }}
      >
        <p className="text-sm font-semibold">New start time after general recall</p>
        <p className="mt-2 text-xs text-splice-ocean dark:text-splice-water">
          Enter signal time as HH:MM on the club race day ({raceDayYmd}).
        </p>
        <input
          type="text"
          inputMode="numeric"
          className="mt-3 w-full rounded-lg border border-splice-water bg-white px-3 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy"
          placeholder="14:55"
          value={recallHmInput}
          onChange={(e) => setRecallHmInput(e.target.value)}
        />
        {recallError ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{recallError}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-splice-water px-3 py-2 text-xs font-medium dark:border-splice-ocean"
            onClick={() => recallDialogRef.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-splice-navy px-3 py-2 text-xs font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
            onClick={confirmRecallRestart}
          >
            Set new start
          </button>
        </div>
      </dialog>
    </section>
  );
}
