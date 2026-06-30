"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const RoTrackAnalysisSetupForm = dynamic(
  () =>
    import("@/components/sailing-analysis/ro-track-analysis-setup-form").then((m) => ({
      default: m.RoTrackAnalysisSetupForm,
    })),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-splice-ocean dark:text-splice-water">Loading track analysis tools…</p>
    ),
  },
);

export function RoTrackAnalysisSetupFormClient(props: ComponentProps<typeof RoTrackAnalysisSetupForm>) {
  return <RoTrackAnalysisSetupForm {...props} />;
}
