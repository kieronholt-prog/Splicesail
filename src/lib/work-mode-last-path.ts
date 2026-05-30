"use client";

import { pathBelongsToWorkMode, workModeHomeHref, type WorkMode } from "@/lib/work-mode";

const STORAGE_KEY = "rm_work_mode_last_paths";

type LastPaths = Partial<Record<WorkMode, string>>;

function readAll(): LastPaths {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LastPaths;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(paths: LastPaths) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(paths));
  } catch {
    /* quota / private mode */
  }
}

export function readWorkModeLastPath(mode: WorkMode): string | null {
  const stored = readAll()[mode];
  if (!stored || !pathBelongsToWorkMode(stored, mode)) return null;
  return stored;
}

export function writeWorkModeLastPath(mode: WorkMode, pathname: string) {
  if (!pathBelongsToWorkMode(pathname, mode)) return;
  const paths = readAll();
  if (paths[mode] === pathname) return;
  writeAll({ ...paths, [mode]: pathname });
}

export function prefetchWorkModeTargets(
  prefetch: (href: string) => void,
  modes: WorkMode[],
) {
  for (const mode of modes) {
    prefetch(readWorkModeLastPath(mode) ?? workModeHomeHref(mode));
  }
}
