import Link from "next/link";
import { headers } from "next/headers";
import { SiteNavActions, type SiteNavItem } from "@/components/site-nav-actions";
import { SpliceWordmark } from "@/components/splice-brand";
import { WorkModePills } from "@/components/work-mode-pills";
import { countPendingAdhocLinksForGroups } from "@/lib/adhoc-link-pending";
import { countUnreadTrackNotifications } from "@/lib/home-track-notifications";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { readWorkModeForUser } from "@/lib/work-mode-cookie";
import {
  navBrandLabel,
  workModeBrandMode,
  workModeHomeHref,
  workModeRaceListHref,
  workModeModeBadgeClass,
  workModeNavHeaderClass,
  workModeSettingsHref,
  workModeShortLabel,
} from "@/lib/work-mode";

/** Minimal chrome while nav data resolves (paired with Suspense in shell layout). */
export function SiteNavFallback() {
  return (
    <header className="border-b border-splice-navy-light bg-splice-navy">
      <nav
        aria-hidden
        className="mx-auto flex max-w-3xl animate-pulse items-center justify-between gap-4 px-4 py-3"
      >
        <div className="h-8 w-44 rounded-lg bg-splice-navy-light" />
        <div className="flex gap-4">
          <div className="h-4 w-12 rounded bg-splice-ocean" />
          <div className="h-4 w-20 rounded bg-splice-ocean" />
        </div>
      </nav>
    </header>
  );
}

export async function SiteNav() {
  const { supabase, user } = await getServerAuth();
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "/";

  let clubsNavHasPendingAdminAttention = false;
  let tracksNavBadge = false;
  let accountNavLabel = "Account";
  let staffMemberships: { role: string; group_id: string }[] = [];

  if (user) {
    const [staffResult, profileResult, trackUnreadCount] = await Promise.all([
      supabase
        .from("group_memberships")
        .select("role, group_id")
        .eq("user_id", user.id)
        .in("role", ["club_admin", "race_officer"]),
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      countUnreadTrackNotifications(supabase, user.id),
    ]);
    staffMemberships = staffResult.data ?? [];
    const { data: profileRow } = profileResult;
    tracksNavBadge = trackUnreadCount > 0;

    const adminIds = staffMemberships
      .filter((r) => r.role === "club_admin")
      .map((r) => r.group_id);

    if (adminIds.length > 0) {
      const [{ count: joinCount }, adhocPendingCount] = await Promise.all([
        supabase
          .from("group_join_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending")
          .in("group_id", adminIds),
        countPendingAdhocLinksForGroups(supabase, adminIds),
      ]);
      clubsNavHasPendingAdminAttention = (joinCount ?? 0) > 0 || adhocPendingCount > 0;
    }

    const displayName = profileRow?.display_name?.trim();
    if (displayName) {
      accountNavLabel = displayName;
    } else if (user.email) {
      accountNavLabel = user.email;
    }
  }

  const { mode, capabilities } = await readWorkModeForUser(
    user?.id ?? null,
    staffMemberships,
    pathname,
  );

  const homeHref = workModeHomeHref(mode);
  const settingsHref = workModeSettingsHref(mode);
  const canFlip = capabilities.availableModes.length > 1;
  const brandMode = workModeBrandMode(mode);

  const navItems: SiteNavItem[] = user
    ? [
        ...(mode === "sailor"
          ? ([
              {
                kind: "link",
                href: "/groups",
                label: "My Entries",
                emphasis: true,
                badge: clubsNavHasPendingAdminAttention,
                ariaLabel: clubsNavHasPendingAdminAttention
                  ? "My Entries — pending admin actions"
                  : "My Entries",
              },
              { kind: "link", href: "/fleet", label: "My boats" },
              {
                kind: "link",
                href: "/tracks",
                label: "Tracks",
                badge: tracksNavBadge,
                ariaLabel: tracksNavBadge ? "Tracks — analysis ready" : "Tracks",
              },
              {
                kind: "link",
                href: settingsHref,
                label: accountNavLabel,
                emphasis: true,
                title: "Your profile, sharing defaults, and create club",
                srPrefix: "Settings · ",
                truncate: true,
              },
            ] satisfies SiteNavItem[])
          : []),
        ...(mode === "admin"
          ? ([
              {
                kind: "link",
                href: "/club-admin",
                label: "Clubs",
                emphasis: true,
                badge: clubsNavHasPendingAdminAttention,
                ariaLabel: clubsNavHasPendingAdminAttention
                  ? "Clubs — pending admin actions"
                  : "Clubs",
              },
              {
                kind: "link",
                href: settingsHref,
                label: "Club settings",
                emphasis: true,
                title: "Club admin settings — Portsmouth numbers, fleets, members",
              },
            ] satisfies SiteNavItem[])
          : []),
        ...(mode === "race_officer"
          ? ([
              {
                kind: "link",
                href: workModeRaceListHref(),
                label: "Race list",
                emphasis: true,
              },
            ] satisfies SiteNavItem[])
          : []),
        { kind: "anchor", href: "/logout", label: "Log out" },
      ]
    : [
        { kind: "link", href: "/health", label: "Health" },
        { kind: "link", href: "/login", label: "Log in" },
        { kind: "cta", href: "/signup", label: "Sign up" },
      ];

  return (
    <header className={workModeNavHeaderClass(mode)}>
      <nav className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            href={homeHref}
            aria-label={`${navBrandLabel(mode)} home`}
            className={`flex min-w-0 shrink-0 items-center gap-2 font-semibold tracking-tight ${mode === "sailor" ? "text-splice-foam" : "text-splice-navy"}`}
          >
            <SpliceWordmark mode={brandMode} className="min-w-0" />
          </Link>
          {canFlip ? (
            <WorkModePills mode={mode} availableModes={capabilities.availableModes} />
          ) : (
            <span className={workModeModeBadgeClass(mode)}>{workModeShortLabel(mode)}</span>
          )}
        </div>
        <SiteNavActions mode={user ? mode : "sailor"} items={navItems} />
      </nav>
    </header>
  );
}
