"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { workModeNavLinkClass, workModePillIdleClass, workModePillsContainerClass, type WorkMode } from "@/lib/work-mode";

export type SiteNavItem =
  | {
      kind: "link";
      href: string;
      label: string;
      emphasis?: boolean;
      title?: string;
      srPrefix?: string;
      truncate?: boolean;
      badge?: boolean;
      ariaLabel?: string;
    }
  | { kind: "anchor"; href: string; label: string; emphasis?: boolean }
  | { kind: "cta"; href: string; label: string };

type Props = {
  mode: WorkMode;
  items: SiteNavItem[];
};

function workModeNavMenuButtonClass(mode: WorkMode): string {
  return workModePillsContainerClass(mode);
}

function workModeNavMenuButtonInnerClass(mode: WorkMode, open: boolean): string {
  const base = `${workModePillIdleClass(mode)} inline-flex items-center justify-center`;
  if (!open) return base;

  switch (mode) {
    case "admin":
      return `${base} bg-emerald-100/80 text-emerald-900`;
    case "race_officer":
      return `${base} bg-splice-sky/60 text-splice-ocean`;
    default:
      return `${base} bg-splice-ocean/35 text-splice-foam`;
  }
}

function NavMenuIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
      <rect x="1" y="2.5" width="14" height="1.5" rx="0.75" />
      <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" />
      <rect x="1" y="12" width="14" height="1.5" rx="0.75" />
    </svg>
  );
}

function workModeNavMenuPanelClass(mode: WorkMode): string {
  const base =
    "absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-lg border py-1 text-sm shadow-lg";
  switch (mode) {
    case "admin":
      return `${base} border-splice-sky bg-white text-splice-navy`;
    case "race_officer":
      return `${base} border-splice-water bg-white text-splice-navy`;
    default:
      return `${base} border-splice-ocean bg-splice-navy-light text-splice-foam`;
  }
}

function workModeNavMenuItemClass(mode: WorkMode, emphasis = false): string {
  const base = "block w-full px-3 py-2 text-left underline-offset-4 hover:underline";
  if (mode === "sailor") {
    return emphasis
      ? `${base} font-medium text-splice-foam hover:bg-splice-ocean/35`
      : `${base} text-splice-water hover:bg-splice-ocean/35 hover:text-splice-foam`;
  }
  return emphasis
    ? `${base} font-medium text-splice-navy hover:bg-splice-surface`
    : `${base} text-splice-ocean hover:bg-splice-surface hover:text-splice-navy`;
}

function itemKey(item: SiteNavItem, index: number): string {
  return `${item.kind}-${item.href}-${index}`;
}

function badgeRingClass(mode: WorkMode, layout: "inline" | "menu"): string {
  if (mode === "sailor") {
    return layout === "menu" ? "ring-splice-navy-light" : "ring-splice-navy";
  }
  return "ring-white";
}

function NavLabel({
  item,
  mode,
  layout,
}: {
  item: SiteNavItem;
  mode: WorkMode;
  layout: "inline" | "menu";
}) {
  if (item.kind === "link" && item.srPrefix) {
    return (
      <>
        <span className="sr-only">{item.srPrefix}</span>
        <span className={item.truncate ? "truncate" : undefined}>{item.label}</span>
      </>
    );
  }

  if (item.kind === "link" && item.badge) {
    return (
      <span className="relative inline-flex">
        {item.label}
        <span
          className={`absolute right-0 top-0 size-2 translate-x-1 -translate-y-0.5 rounded-full bg-red-500 ring-2 ${badgeRingClass(mode, layout)}`}
          aria-hidden
        />
      </span>
    );
  }

  return <>{item.label}</>;
}

function itemEmphasis(item: SiteNavItem): boolean {
  if (item.kind === "cta") return false;
  return item.emphasis ?? false;
}

function navItemClassName(item: SiteNavItem, mode: WorkMode, layout: "inline" | "menu"): string {
  if (item.kind === "cta") {
    return layout === "menu"
      ? "mx-2 my-1 block rounded-lg bg-splice-foam px-3 py-2 text-center font-medium text-splice-navy"
      : "rounded-lg bg-splice-foam px-3 py-1.5 font-medium text-splice-navy";
  }

  if (layout === "menu") {
    return workModeNavMenuItemClass(mode, itemEmphasis(item));
  }

  if (item.kind === "link" && item.truncate) {
    return `inline-flex max-w-[12rem] items-baseline truncate ${workModeNavLinkClass(mode, item.emphasis)}`;
  }

  return workModeNavLinkClass(mode, itemEmphasis(item));
}

function renderNavItem(
  item: SiteNavItem,
  mode: WorkMode,
  layout: "inline" | "menu",
  onNavigate?: () => void,
) {
  const className = navItemClassName(item, mode, layout);

  const close = onNavigate;

  if (item.kind === "anchor") {
    return (
      <a href={item.href} className={className} onClick={close}>
        {item.label}
      </a>
    );
  }

  return (
    <Link
      href={item.href}
      title={item.kind === "link" ? item.title : undefined}
      aria-label={item.kind === "link" ? item.ariaLabel : undefined}
      className={className}
      onClick={close}
      role={layout === "menu" ? "menuitem" : undefined}
    >
      <NavLabel item={item} mode={mode} layout={layout} />
    </Link>
  );
}

export function SiteNavActions({ mode, items }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;

    function onDocMouseDown(ev: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) {
        setMenuOpen(false);
      }
    }

    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <div className="hidden flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm md:flex">
        {items.map((item, index) => (
          <span key={itemKey(item, index)}>{renderNavItem(item, mode, "inline")}</span>
        ))}
      </div>

      <div ref={wrapRef} className="relative shrink-0 md:hidden">
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-controls={menuId}
          className={workModeNavMenuButtonClass(mode)}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className={workModeNavMenuButtonInnerClass(mode, menuOpen)}>
            <NavMenuIcon />
          </span>
        </button>
        {menuOpen ? (
          <div
            id={menuId}
            role="menu"
            aria-label="Site navigation"
            className={workModeNavMenuPanelClass(mode)}
          >
            {items.map((item, index) => (
              <div key={itemKey(item, index)} role="none">
                {renderNavItem(item, mode, "menu", closeMenu)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
