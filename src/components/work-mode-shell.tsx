"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { writeWorkModeLastPath } from "@/lib/work-mode-last-path";
import type { WorkMode } from "@/lib/work-mode";
import { workModeShellClass } from "@/lib/work-mode";

type Props = {
  mode: WorkMode;
  children: React.ReactNode;
};

export function WorkModeShell({ mode, children }: Props) {
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.dataset.workMode = mode;
    return () => {
      delete document.documentElement.dataset.workMode;
    };
  }, [mode]);

  useEffect(() => {
    if (pathname) writeWorkModeLastPath(mode, pathname);
  }, [mode, pathname]);

  return (
    <div className={`flex min-h-full flex-1 flex-col ${workModeShellClass(mode)}`}>{children}</div>
  );
}
