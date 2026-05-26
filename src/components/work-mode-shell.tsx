"use client";

import { useEffect } from "react";
import type { WorkMode } from "@/lib/work-mode";
import { workModeShellClass } from "@/lib/work-mode";

type Props = {
  mode: WorkMode;
  children: React.ReactNode;
};

export function WorkModeShell({ mode, children }: Props) {
  useEffect(() => {
    document.documentElement.dataset.workMode = mode;
    return () => {
      delete document.documentElement.dataset.workMode;
    };
  }, [mode]);

  return (
    <div className={`flex min-h-full flex-1 flex-col ${workModeShellClass(mode)}`}>{children}</div>
  );
}
