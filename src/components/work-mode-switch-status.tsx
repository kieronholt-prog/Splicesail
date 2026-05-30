"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { workModeLabel, type WorkMode } from "@/lib/work-mode";

function WorkModeSwitchSpinner() {
  return (
    <svg
      aria-hidden
      className="size-5 shrink-0 animate-spin text-splice-blue"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

type Props = {
  targetMode: WorkMode | null;
  navigating: boolean;
};

export function WorkModeSwitchStatus({ targetMode, navigating }: Props) {
  const { pending: formPending } = useFormStatus();
  const pending = formPending || navigating;
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!pending) {
      setElapsedSec(0);
      return;
    }
    setElapsedSec(0);
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [pending, targetMode]);

  if (!pending || !targetMode) return null;

  const label = workModeLabel(targetMode);

  return (
    <div
      className="fixed inset-x-0 top-0 z-[90] flex justify-center px-4 pt-2 pointer-events-none"
      role="status"
      aria-live="polite"
      aria-label={`Switching to ${label} mode`}
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-splice-sky bg-white/95 px-4 py-2 text-sm font-medium text-splice-navy shadow-md backdrop-blur-sm">
        <WorkModeSwitchSpinner />
        <span>
          Switching to {label}
          <span className="tabular-nums text-splice-ocean" aria-hidden>
            {" "}
            · {elapsedSec}s
          </span>
        </span>
      </div>
    </div>
  );
}
