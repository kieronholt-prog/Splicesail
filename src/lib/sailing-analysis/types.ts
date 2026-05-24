export type TrackPoint = {
  lat: number;
  lon: number;
  time: number | null;
  sog?: number;
  cog?: number;
  dist?: number;
  ss?: number;
};

export type DetectionSettings = {
  tack: {
    minTurn: number;
    maxTurn: number;
    minSpeed: number;
    cooldownSec: number;
    beforePts: number;
    afterPts: number;
  };
  gybe: {
    minTurn: number;
    maxTurn: number;
    minSpeed: number;
    cooldownSec: number;
    beforePts: number;
    afterPts: number;
  };
};

export type MarkOverride = { lat: number; lon: number };

export type CourseSetup = Record<string, unknown>;

export type AnalysisMode = "standalone" | "collated";

export type SubmissionStatus =
  | "draft"
  | "pending_confirm"
  | "pending_mode"
  | "pending_setup"
  | "pending_ro"
  | "ready"
  | "cancelled";

export type TrackSource = "strava" | "upload";

export type SailingMarkRow = {
  id: string;
  group_id: string;
  name: string;
  lat: number;
  lon: number;
  mark_kind: "fixed" | "laid";
  chart_ref: string | null;
  description: string | null;
  sort_order: number;
};

export type SailingCourseRow = {
  id: string;
  group_id: string;
  course_letter: string;
  display_name: string;
  course_type: "SC" | "MC" | "LC" | "custom";
  mark_sequence: [string, "P" | "S"][];
  marks_preamble: [string, "P" | "S"][];
  sort_order: number;
};
