/** Exit (client) and enter (post-navigation) work-mode flip animations. */
export const WORK_MODE_FLIP_DURATION_MS = 500;

/** Submit navigation before exit fully ends so server work overlaps the last frames. */
export const WORK_MODE_FLIP_EXIT_SUBMIT_RATIO = 0.88;

export const WORK_MODE_FLIP_EXIT_CLASS = "work-mode-flip-exit";
export const WORK_MODE_FLIP_ENTER_CLASS = "work-mode-flip-enter";
export const WORK_MODE_FLIP_PENDING_CLASS = "work-mode-flip-pending";

export function workModeFlipDurationMs(): number {
  if (typeof window === "undefined") return WORK_MODE_FLIP_DURATION_MS;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  return WORK_MODE_FLIP_DURATION_MS;
}

export function workModeFlipExitSubmitDelayMs(): number {
  return Math.round(workModeFlipDurationMs() * WORK_MODE_FLIP_EXIT_SUBMIT_RATIO);
}

/** Clears flip classes that can persist on <html> across Next client navigations. */
export function clearWorkModeFlipClasses(root: HTMLElement = document.documentElement): void {
  root.classList.remove(
    WORK_MODE_FLIP_EXIT_CLASS,
    WORK_MODE_FLIP_ENTER_CLASS,
    WORK_MODE_FLIP_PENDING_CLASS,
  );
  delete root.dataset.workModeFlipTarget;
}

/** Ensures the browser commits a style change before the next animation frame. */
export function flushWorkModeFlipStyles(root: HTMLElement = document.documentElement): void {
  void root.offsetHeight;
}
