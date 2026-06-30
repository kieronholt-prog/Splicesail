export const WORK_MODE_COOKIE = "rm_work_mode";

export type WorkMode = "sailor" | "admin" | "race_officer";

export type WorkModeCapabilities = {
  hasAdmin: boolean;
  hasRaceOfficer: boolean;
  availableModes: WorkMode[];
};

export function resolveWorkModeCapabilities(
  staffMemberships: { role: string }[],
): WorkModeCapabilities {
  const hasAdmin = staffMemberships.some((r) => r.role === "club_admin");
  const hasRaceOfficer = staffMemberships.length > 0;
  const availableModes: WorkMode[] = ["sailor"];
  if (hasAdmin) availableModes.push("admin");
  if (hasRaceOfficer) availableModes.push("race_officer");
  return { hasAdmin, hasRaceOfficer, availableModes };
}

export function parseWorkModeCookie(value: string | undefined): WorkMode | null {
  if (value === "sailor" || value === "admin" || value === "race_officer") return value;
  return null;
}

export function isStaffPath(pathname: string): boolean {
  return isAdminPath(pathname) || isRaceOfficerPath(pathname);
}

export function resolveWorkMode(
  cookieValue: string | undefined,
  capabilities: WorkModeCapabilities,
  pathname?: string,
): WorkMode {
  if (pathname) {
    const fromStaffRoute = staffRouteWorkMode(pathname);
    if (fromStaffRoute && capabilities.availableModes.includes(fromStaffRoute)) {
      return fromStaffRoute;
    }
    // Sailor chrome on non-staff URLs — ignore a stale admin/RO cookie (e.g. opening `/`).
    if (!isStaffPath(pathname)) return "sailor";
  }
  const stored = parseWorkModeCookie(cookieValue);
  if (stored && capabilities.availableModes.includes(stored)) return stored;
  if (pathname) return inferWorkModeFromPath(pathname, capabilities);
  return "sailor";
}

/** Set work mode when opening staff routes (does not downgrade sailor choice elsewhere). */
export function staffRouteWorkMode(pathname: string): WorkMode | null {
  if (isAdminPath(pathname)) return "admin";
  if (isRaceOfficerPath(pathname)) return "race_officer";
  return null;
}

function inferWorkModeFromPath(pathname: string, capabilities: WorkModeCapabilities): WorkMode {
  if (capabilities.hasAdmin && isAdminPath(pathname)) return "admin";
  if (capabilities.hasRaceOfficer && isRaceOfficerPath(pathname)) return "race_officer";
  return "sailor";
}

function isAdminPath(pathname: string): boolean {
  if (/\/club-admin(\/|$)/.test(pathname)) return true;
  if (/\/series\/new$/.test(pathname)) return true;
  if (/\/scoring$/.test(pathname)) return true;
  if (/\/fleets(\/|$)/.test(pathname) && pathname.includes("/groups/")) return true;
  return false;
}

function isRaceOfficerPath(pathname: string): boolean {
  if (pathname === "/race-officer" || pathname.startsWith("/race-officer/")) return true;
  if (/\/race-officer(\/|$)/.test(pathname)) return true;
  if (/\/finishes$/.test(pathname)) return true;
  if (/\/manage$/.test(pathname) && pathname.includes("/races/")) return true;
  if (/\/track-analysis$/.test(pathname)) return true;
  if (/\/track-compare$/.test(pathname)) return true;
  if (/\/entries\/[^/]+\/context$/.test(pathname)) return true;
  return false;
}

/** Whether a stored path is safe to reopen when switching into the given work mode. */
export function pathBelongsToWorkMode(pathname: string, mode: WorkMode): boolean {
  if (!pathname.startsWith("/")) return false;
  const staff = staffRouteWorkMode(pathname);
  switch (mode) {
    case "admin":
      return staff === "admin";
    case "race_officer":
      return staff === "race_officer";
    default:
      return staff === null;
  }
}

export function resolveWorkModeSwitchHref(mode: WorkMode, lastPath?: string | null): string {
  if (lastPath && pathBelongsToWorkMode(lastPath, mode)) return lastPath;
  return workModeHomeHref(mode);
}

export function cycleWorkMode(current: WorkMode, availableModes: WorkMode[]): WorkMode {
  const idx = availableModes.indexOf(current);
  const nextIdx = idx < 0 ? 0 : (idx + 1) % availableModes.length;
  return availableModes[nextIdx] ?? "sailor";
}

export function workModeHomeHref(mode: WorkMode): string {
  switch (mode) {
    case "admin":
      return "/club-admin";
    case "race_officer":
      return "/race-officer";
    default:
      return "/";
  }
}

export function workModeRaceListHref(): string {
  return "/race-officer/races";
}

export function workModeSettingsHref(mode: WorkMode): string {
  switch (mode) {
    case "admin":
      return "/club-admin";
    case "race_officer":
      return workModeRaceListHref();
    default:
      return "/account";
  }
}

export function workModeLabel(mode: WorkMode): string {
  switch (mode) {
    case "admin":
      return "Club admin";
    case "race_officer":
      return "Race officer";
    default:
      return "Sailor";
  }
}

export function workModeShortLabel(mode: WorkMode): string {
  switch (mode) {
    case "admin":
      return "Admin";
    case "race_officer":
      return "RO";
    default:
      return "Sailor";
  }
}

/** Shell + nav chrome tuned per mode (independent of OS dark preference). */
export function workModeShellClass(mode: WorkMode): string {
  switch (mode) {
    case "admin":
      return "work-mode-shell work-mode-admin bg-splice-surface text-splice-navy";
    case "race_officer":
      return "work-mode-shell work-mode-ro bg-splice-foam text-splice-navy";
    default:
      return "work-mode-shell work-mode-sailor bg-splice-navy text-splice-foam";
  }
}

export function workModeNavHeaderClass(mode: WorkMode): string {
  switch (mode) {
    case "admin":
      return "border-b border-splice-sky bg-white text-splice-navy";
    case "race_officer":
      return "border-b border-splice-water bg-splice-foam text-splice-navy";
    default:
      return "border-b border-splice-navy-light bg-splice-navy text-splice-foam";
  }
}

export function workModeNavLinkClass(mode: WorkMode, emphasis = false): string {
  const base = "underline-offset-4 hover:underline";
  if (mode === "sailor") {
    return emphasis
      ? `${base} font-medium text-splice-foam`
      : `${base} text-splice-water hover:text-splice-foam`;
  }
  return emphasis
    ? `${base} font-medium text-splice-navy`
    : `${base} text-splice-ocean hover:text-splice-navy`;
}

export function workModeNavHomeIconClass(mode: WorkMode): string {
  switch (mode) {
    case "admin":
      return "inline-flex shrink-0 items-center justify-center";
    case "race_officer":
      return "inline-flex shrink-0 items-center justify-center";
    default:
      return "inline-flex shrink-0 items-center justify-center";
  }
}

export function workModePillsContainerClass(mode: WorkMode): string {
  const base = "inline-flex shrink-0 rounded-lg border p-0.5";
  switch (mode) {
    case "admin":
      return `${base} border-emerald-300 bg-emerald-50/90`;
    case "race_officer":
      return `${base} border-splice-water bg-white/80`;
    default:
      return `${base} border-splice-ocean bg-splice-navy-light/70`;
  }
}

export function workModePillIdleClass(navMode: WorkMode): string {
  const base = "rounded-md px-2 py-1 text-xs font-medium transition";
  switch (navMode) {
    case "admin":
      return `${base} text-emerald-900/75 hover:bg-emerald-100/80`;
    case "race_officer":
      return `${base} text-splice-ocean/80 hover:bg-splice-sky/60`;
    default:
      return `${base} text-splice-water hover:bg-splice-ocean/35 hover:text-splice-foam`;
  }
}

export function workModePillSelectedClass(pillMode: WorkMode): string {
  const base = "rounded-md px-2 py-1 text-xs font-semibold shadow-sm";
  switch (pillMode) {
    case "admin":
      return `${base} bg-emerald-600 text-white`;
    case "race_officer":
      return `${base} bg-splice-blue text-white`;
    default:
      return `${base} bg-splice-foam text-splice-navy`;
  }
}

export function workModeModeBadgeClass(mode: WorkMode): string {
  switch (mode) {
    case "admin":
      return "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900";
    case "race_officer":
      return "rounded-full bg-splice-sky px-2 py-0.5 text-xs font-semibold text-splice-ocean";
    default:
      return "rounded-full bg-splice-navy-light px-2 py-0.5 text-xs font-semibold text-splice-water";
  }
}

export function workModeBrandMode(mode: WorkMode): "light" | "dark" {
  return mode === "sailor" ? "dark" : "light";
}

export function navBrandLabel(mode: WorkMode): string {
  switch (mode) {
    case "admin":
      return "Splice — Admin";
    case "race_officer":
      return "Splice — RO";
    default:
      return "Splice";
  }
}
