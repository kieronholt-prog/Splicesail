"use client";

import { useEffect } from "react";

const PRESS_SWAP_ATTR = "data-splice-press-swap";

function isTransparent(color: string): boolean {
  if (!color || color === "transparent") return true;
  const match = color.match(
    /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*([\d.]+))?\s*\)/,
  );
  if (!match) return false;
  return match[1] !== undefined && parseFloat(match[1]) === 0;
}

function findPressable(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target.closest("[data-no-press-swap]")) return null;

  const el = target.closest(
    "button, input[type='submit'], input[type='button'], [role='button']",
  ) as HTMLElement | null;
  if (!el) return null;

  if (el instanceof HTMLButtonElement && el.disabled) return null;
  if (el instanceof HTMLInputElement && el.disabled) return null;
  if (el.getAttribute("aria-disabled") === "true") return null;

  return el;
}

/** Snapshot computed colours so :active can swap background and text. */
function captureSwapColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const fg = cs.color;
  const bg = cs.backgroundColor;

  if (isTransparent(bg)) {
    el.style.setProperty("--splice-press-bg", fg);
    el.style.setProperty("--splice-press-fg", "var(--splice-foam)");
  } else {
    el.style.setProperty("--splice-press-bg", fg);
    el.style.setProperty("--splice-press-fg", bg);
  }

  el.setAttribute(PRESS_SWAP_ATTR, "");
}

/** Global press feedback: invert background and text while a button is held. */
export function ButtonPressSwap() {
  useEffect(() => {
    function onPressStart(e: Event) {
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (e.repeat) return;
      }

      const el = findPressable(e.target);
      if (!el) return;
      captureSwapColors(el);
    }

    document.addEventListener("pointerdown", onPressStart, true);
    document.addEventListener("keydown", onPressStart, true);
    return () => {
      document.removeEventListener("pointerdown", onPressStart, true);
      document.removeEventListener("keydown", onPressStart, true);
    };
  }, []);

  return null;
}
