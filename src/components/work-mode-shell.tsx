"use client";

import { useEffect, useLayoutEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  WORK_MODE_FLIP_ENTER_CLASS,
  clearWorkModeFlipClasses,
  flushWorkModeFlipStyles,
  workModeFlipDurationMs,
} from "@/lib/work-mode-transition";
import type { WorkMode } from "@/lib/work-mode";
import { workModeShellClass } from "@/lib/work-mode";

type Props = {
  mode: WorkMode;
  children: React.ReactNode;
};

export function WorkModeShell({ mode, children }: Props) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    document.documentElement.dataset.workMode = mode;
    return () => {
      delete document.documentElement.dataset.workMode;
    };
  }, [mode]);

  useLayoutEffect(() => {
    if (searchParams.get("mode_flip") !== "1") return;

    const root = document.documentElement;
    clearWorkModeFlipClasses(root);

    const durationMs = workModeFlipDurationMs();
    let enterTimer: number | undefined;
    const urlTimer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("mode_flip");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, durationMs);

    if (durationMs > 0) {
      root.classList.add(WORK_MODE_FLIP_ENTER_CLASS);
      flushWorkModeFlipStyles(root);
      enterTimer = window.setTimeout(() => {
        clearWorkModeFlipClasses(root);
      }, durationMs);
    }

    return () => {
      if (enterTimer != null) window.clearTimeout(enterTimer);
      window.clearTimeout(urlTimer);
      clearWorkModeFlipClasses(root);
    };
  }, [searchParams, pathname, router]);

  return (
    <div className={`flex min-h-full flex-1 flex-col ${workModeShellClass(mode)}`}>{children}</div>
  );
}
