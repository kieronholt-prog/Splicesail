"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Props = {
  /** Accessible name for the trigger (e.g. “About mode”). */
  label: string;
  children: ReactNode;
};

const MARGIN = 12;
const GAP = 6;

/** (i) button opens a help panel; closes on outside click, Escape, scroll, or resize. Panel stays within the viewport. */
export function InfoHint({ label, children }: Props) {
  const id = useId();
  const panelId = `${id}-panel`;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current || !panelRef.current) {
      setPos(null);
      return;
    }
    const btn = btnRef.current.getBoundingClientRect();
    const panel = panelRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = btn.bottom + GAP;
    let left = btn.left + btn.width / 2 - panel.width / 2;

    left = Math.max(MARGIN, Math.min(left, vw - panel.width - MARGIN));

    if (top + panel.height > vh - MARGIN) {
      top = btn.top - GAP - panel.height;
    }
    if (top < MARGIN) {
      top = MARGIN;
    }
    if (top + panel.height > vh - MARGIN) {
      top = Math.max(MARGIN, vh - panel.height - MARGIN);
    }

    setPos({ top, left });
  }, [open, children]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (rootRef.current && !rootRef.current.contains(t)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onScroll() {
      setOpen(false);
    }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onResize() {
      setOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex align-middle">
      <button
        ref={btnRef}
        type="button"
        className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-splice-water text-[10px] font-bold leading-none text-splice-ocean hover:bg-splice-foam dark:border-splice-ocean dark:text-splice-water dark:hover:bg-splice-navy-light"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="tooltip"
          className="fixed z-[100] max-h-[min(70vh,calc(100vh-24px))] w-[min(18rem,calc(100vw-24px))] overflow-y-auto rounded-lg border border-splice-sky bg-white p-2.5 text-xs leading-snug text-splice-ocean shadow-lg dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-water"
          style={
            pos
              ? { top: pos.top, left: pos.left, visibility: "visible" }
              : { top: 0, left: 0, visibility: "hidden", pointerEvents: "none" }
          }
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
