import Link from "next/link";
import { getServerAuth } from "@/lib/supabase/auth-cache";

/** Minimal chrome while nav data resolves (paired with Suspense in root layout). */
export function SiteNavFallback() {
  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <nav
        aria-hidden
        className="mx-auto flex max-w-3xl animate-pulse items-center justify-between gap-4 px-4 py-3"
      >
        <div className="h-8 w-44 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="flex gap-4">
          <div className="h-4 w-12 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-20 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </nav>
    </header>
  );
}

export async function SiteNav() {
  const { supabase, user } = await getServerAuth();

  let clubsNavHasPendingJoinRequests = false;
  let showRaceOfficerNav = false;
  let showClubAdminNav = false;
  let accountNavLabel = "Account";
  if (user) {
    const [staffMembershipsResult, profileResult] = await Promise.all([
      supabase
        .from("group_memberships")
        .select("group_id, role")
        .eq("user_id", user.id)
        .in("role", ["club_admin", "race_officer"]),
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    ]);

    const { data: staffMemberships } = staffMembershipsResult;
    const { data: profileRow } = profileResult;
    const staffList = staffMemberships ?? [];
    showRaceOfficerNav = staffList.length > 0;
    showClubAdminNav = staffList.some((r) => r.role === "club_admin");

    const adminGroupIds = staffList
      .filter((r) => r.role === "club_admin")
      .map((r) => r.group_id);
    if (adminGroupIds.length > 0) {
      const { count } = await supabase
        .from("group_join_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending")
        .in("group_id", adminGroupIds);
      clubsNavHasPendingJoinRequests = (count ?? 0) > 0;
    }

    const displayName = profileRow?.display_name?.trim();
    if (displayName) {
      accountNavLabel = displayName;
    } else if (user.email) {
      accountNavLabel = user.email;
    }
  }

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <nav className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          aria-label="Race Manager home"
          className="flex items-center gap-2 font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            aria-hidden
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 1-1.06 1.06l-1.318-1.318V19.5a2.25 2.25 0 0 1-2.25 2.25h-10.5A2.25 2.25 0 0 1 3 19.5v-7.227l-1.318 1.318a.75.75 0 1 1-1.06-1.06l8.69-8.69ZM12 6.75l-7.5 7.5V19.5a.75.75 0 0 0 .75.75h4.5v-4.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 0 .75-.75v-5.25L12 6.75Z" />
            </svg>
          </span>
          Race Manager
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm">
          <Link
            href="/health"
            className="text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Health
          </Link>
          {user ? (
            <>
              <Link
                href="/groups"
                className="relative inline-flex font-medium text-zinc-900 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-100 dark:hover:text-zinc-50"
                aria-label={
                  clubsNavHasPendingJoinRequests
                    ? "My Entries — pending join requests"
                    : "My Entries"
                }
              >
                My Entries
                {clubsNavHasPendingJoinRequests ? (
                  <span
                    className="absolute right-0 top-0 size-2 translate-x-1 -translate-y-0.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-950"
                    aria-hidden
                  />
                ) : null}
              </Link>
              {showClubAdminNav ? (
                <Link
                  href="/club-admin"
                  className="font-medium text-zinc-900 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-100 dark:hover:text-zinc-50"
                >
                  Club admin
                </Link>
              ) : null}
              {showRaceOfficerNav ? (
                <Link
                  href="/race-officer"
                  className="font-medium text-zinc-900 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-100 dark:hover:text-zinc-50"
                >
                  Race officer
                </Link>
              ) : null}
              <Link
                href="/fleet"
                className="text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                My boats
              </Link>
              <Link
                href="/account"
                title="Your profile & account settings"
                className="inline-flex max-w-[12rem] items-baseline truncate font-medium text-zinc-900 underline-offset-4 hover:text-zinc-950 hover:underline dark:text-zinc-100 dark:hover:text-zinc-50"
              >
                <span className="sr-only">Your account · </span>
                <span className="truncate">{accountNavLabel}</span>
              </Link>
              <a
                href="/logout"
                className="text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Log out
              </a>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
