/** Subset of `runAnalysis` output persisted in `race_track_analyses.analysis_snapshot`. */

export type AnalysisManoeuvre = {
  type?: "tack" | "gybe";
  idx?: number;
  turnIdx?: number;
  ch?: number;
  crossing?: string;
  sideBef?: "P" | "S";
  q?: number;
  preS?: number;
  minS?: number;
  rt?: number;
  lat?: number;
  lon?: number;
  excludeFromStatsAndVMG?: boolean;
  excludeMarkRadius?: boolean;
  excludeNearRoundingIdx?: boolean;
  nearestMarkName?: string;
  nearestMarkDistM?: number;
  tackMeanVmgKts?: number;
  refUpwindWindowVmgKts?: number;
  refVmgSource?: string;
  exitBias?: string;
  exitBiasAmount?: number;
  performance?: {
    turn_rate_deg_sec?: number;
    ref_vmg_source?: string;
    t_init?: number;
    t_complete?: number;
    t_cross?: number;
  };
  perfChart?: {
    data?: { tRel: number; vmg: number | null }[];
    markers?: { tRel_turn_start?: number; tRel_turn_end?: number };
  };
  markRounding?: {
    mark?: string;
    roundTack?: string;
    lap?: number;
    splitRole?: string;
    totalTurnInZoneDeg?: number;
    netBearingChangeDeg?: number;
    manoeuvrePortionDeg?: number;
    markArcResidualDeg?: number;
    detectionAngleDeg?: number;
  };
};

export type AnalysisLeg = {
  from?: string;
  to?: string;
  type?: string;
  startIdx?: number;
  endIdx?: number;
  distance?: number;
  duration?: number;
  avgSpeed?: number;
  avgVmc?: number;
  avgVmgToWind?: number;
  avgVMG?: number;
  efficiency?: number;
  chordProgressKts?: number;
  legBearing?: number;
  roundingM?: number;
  startLineDistanceM?: number;
};

export type AnalysisSnapshot = {
  points?: { lat: number; lon: number; time?: number | null }[];
  windDir?: number | null;
  trackSegmentFC?: GeoJSON.FeatureCollection | { type: string; features: unknown[] } | null;
  tacks?: AnalysisManoeuvre[];
  gybes?: AnalysisManoeuvre[];
  legs?: AnalysisLeg[];
  stats?: Record<string, unknown>;
  upwindByTack?: Record<string, unknown>;
  markRoundingDetails?: Record<string, unknown>[];
  speedTL?: { time: number; speed: number; cog?: number }[];
  windTrace?: { time: number; dir: number }[];
  startLine?: {
    hasLine?: boolean;
    distM?: number | null;
    timeDeltaSec?: number | null;
    speedPct?: number | null;
  } | null;
  gpsToBowM?: number;
};

export type StartFinishLineEnds = {
  endA: { lat: number; lon: number };
  endB: { lat: number; lon: number };
};

export type MapManoeuvres = { tacks: AnalysisManoeuvre[]; gybes: AnalysisManoeuvre[] };
