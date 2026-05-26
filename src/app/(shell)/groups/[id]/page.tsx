import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  approveJoinRequestAction,
  declineJoinRequestAction,
  requestJoinClubAction,
} from "@/app/actions/group-join-requests";
import { promoteToClubAdminAction } from "@/app/actions/group-members";
import { formatPostgresDateDdMmmYyyy } from "@/lib/club-display-format";
import {
  formatClubDateTimeMediumShort,
  resolveClubIanaTimeZone,
} from "@/lib/club-time";
import { ClubStaffModeLinks } from "@/components/club-staff-mode-links";
import { ClubSeriesMaintenanceSection } from "@/components/club-series-maintenance-section";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { fetchStaffMemberships, readWorkModeForUser } from "@/lib/work-mode-cookie";

function membershipRoleLabel(role: string, isClubAdminWithSeriesBoats: boolean): string {
  if (role === "club_admin" && isClubAdminWithSeriesBoats) return "Sailor & Club Admin";
  if (role === "club_admin") return "Club Admin";
  if (role === "race_officer") return "Race Officer";
  if (role === "sailor") return "Sailor";
  return role.replace(/_/g, " ");
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    promoted?: string;
    series_deleted?: string;
    join_requested?: string;
    join_approved?: string;
    join_declined?: string;
  }>;
};

export default async function GroupDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const pageError = q.error ? decodeURIComponent(q.error) : null;
  const promoted = q.promoted === "1";
  const seriesDeleted = q.series_deleted === "1";
  const joinRequested = q.join_requested === "1";
  const joinApprovedAdmin = q.join_approved === "1";
  const joinDeclinedAdmin = q.join_declined === "1";

  const { supabase, user } = await getServerAuth();

  if (!user) {
    redirect("/login");
  }

  const staffMemberships = await fetchStaffMemberships(supabase, user.id);
  const { mode: workMode } = await readWorkModeForUser(user.id, staffMemberships);

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, name, slug, created_at, iana_timezone")
    .eq("id", id)
    .maybeSingle();

  if (groupError || !group) {
    notFound();
  }

  const clubTz = resolveClubIanaTimeZone(
    (group as { iana_timezone?: string | null }).iana_timezone,
  );

  const { data: myMembership } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!myMembership) {
    const { data: latestReq } = await supabase
      .from("group_join_requests")
      .select("id, status, created_at")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const pending = latestReq?.status === "pending";
    const declined = latestReq?.status === "declined";

    return (
      <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
        <main className="mx-auto w-full max-w-2xl">
          <p className="text-sm text-splice-ocean dark:text-splice-water">
            <Link href="/groups" className="text-splice-blue hover:underline dark:text-splice-water">
              ← My Entries
            </Link>
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
            {group.name}
          </h1>
          {group.slug ? (
            <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
              Short name:{" "}
              <code className="rounded bg-splice-sky px-1 dark:bg-splice-navy-light">/{group.slug}</code>
              {" · "}
              <Link
                href={`/results/${encodeURIComponent(group.slug)}`}
                className="font-medium text-splice-blue underline dark:text-splice-water"
              >
                Public results
              </Link>
            </p>
          ) : null}

          {pageError ? (
            <p
              className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
              role="alert"
            >
              {pageError}
            </p>
          ) : null}
          {joinRequested ? (
            <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              Request sent. A club administrator will approve or decline your request.
            </p>
          ) : null}

          <section className="mt-8 rounded-xl border border-splice-sky bg-white p-6 dark:border-splice-navy-light dark:bg-splice-navy">
            <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">Join this club</h2>
            <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
              You are not a member yet. Request access below. Club admins review new members before they can see
              series, fleets, and results here.
            </p>
            {pending ? (
              <p className="mt-4 rounded-lg bg-splice-foam px-3 py-2 text-sm text-splice-navy-light dark:bg-splice-navy-light dark:text-splice-sky">
                Your join request is <strong>pending</strong>. You will be able to use this club after an admin
                approves it.
              </p>
            ) : null}
            {declined ? (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                Your previous request was <strong>declined</strong>. You can send another request if that was a
                mistake.
              </p>
            ) : null}
            {!pending ? (
              <form action={requestJoinClubAction} className="mt-4">
                <input type="hidden" name="group_id" value={id} />
                <button
                  type="submit"
                  className="inline-flex justify-center rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
                >
                  Request to join
                </button>
              </form>
            ) : null}
          </section>
        </main>
      </div>
    );
  }

  const { data: memberRows, error: membersError } = await supabase
    .from("group_memberships")
    .select("user_id, role, created_at")
    .eq("group_id", id)
    .order("role", { ascending: true });

  const ids = memberRows?.map((m) => m.user_id) ?? [];
  const nameByUser = new Map<string, string | null>();

  if (ids.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", ids);

    for (const p of profileRows ?? []) {
      nameByUser.set(p.id, p.display_name);
    }
  }

  const isAdmin = myMembership.role === "club_admin";
  const showAdminMemberTools = isAdmin && workMode === "admin";
  const isRaceOfficerStaff =
    myMembership.role === "race_officer" || myMembership.role === "club_admin";
  const canMaintainSeries =
    myMembership.role === "club_admin" || myMembership.role === "race_officer";

  let pendingJoinRows: { id: string; user_id: string; created_at: string }[] = [];
  const joinRequestNameByUser = new Map<string, string | null>();
  if (showAdminMemberTools) {
    const { data: pend } = await supabase
      .from("group_join_requests")
      .select("id, user_id, created_at")
      .eq("group_id", id)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    pendingJoinRows = pend ?? [];
    const pendIds = pendingJoinRows.map((r) => r.user_id);
    if (pendIds.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", pendIds);
      for (const p of profileRows ?? []) {
        joinRequestNameByUser.set(p.id, p.display_name);
      }
    }
  }

  const { data: seriesRows } = await supabase
    .from("series")
    .select("id, name, starts_on, ends_on")
    .eq("group_id", id)
    .order("name", { ascending: true });

  const seriesIdList = (seriesRows ?? []).map((s) => s.id);

  const clubAdminUserIds = (memberRows ?? []).filter((m) => m.role === "club_admin").map((m) => m.user_id);
  const clubAdminWithSeriesBoats = new Set<string>();
  if (seriesIdList.length > 0 && clubAdminUserIds.length > 0) {
    const { data: adminBoatRegs } = await supabase
      .from("series_registration_boats")
      .select("user_id")
      .in("series_id", seriesIdList)
      .in("user_id", clubAdminUserIds);
    for (const row of adminBoatRegs ?? []) {
      clubAdminWithSeriesBoats.add(row.user_id);
    }
  }

  const maintenanceSeriesRows = (seriesRows ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    dateLabel: `From ${formatPostgresDateDdMmmYyyy(s.starts_on)} To ${formatPostgresDateDdMmmYyyy(s.ends_on)}`,
  }));

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-2xl">
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          <Link
            href={
              workMode === "admin"
                ? `/groups/${id}/club-admin`
                : workMode === "race_officer"
                  ? "/race-officer/races"
                  : "/groups"
            }
            className="text-splice-blue hover:underline dark:text-splice-water"
          >
            {workMode === "sailor" ? "← My Entries" : "← Back"}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
          {group.name}
        </h1>
        <div className="mt-2 flex flex-wrap gap-3 text-sm text-splice-ocean dark:text-splice-water">
          {group.slug ? (
            <span>
              Short name:{" "}
              <code className="rounded bg-splice-sky px-1 dark:bg-splice-navy-light">/{group.slug}</code>
            </span>
          ) : null}
          <span>
            Your role:{" "}
            <strong className="text-splice-navy-light dark:text-splice-sky">
              {membershipRoleLabel(myMembership.role, clubAdminWithSeriesBoats.has(user.id))}
            </strong>
          </span>
          {isAdmin ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100">
              Club admin
            </span>
          ) : null}
        </div>

        <ClubStaffModeLinks
          groupId={id}
          workMode={workMode}
          isClubAdmin={isAdmin}
          isRaceOfficer={isRaceOfficerStaff}
        />

        {promoted ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Member promoted to club admin.
          </p>
        ) : null}
        {seriesDeleted ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Series deleted.
          </p>
        ) : null}
        {joinApprovedAdmin ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Join request approved — they are now a member (sailor).
          </p>
        ) : null}
        {joinDeclinedAdmin ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Join request declined.
          </p>
        ) : null}
        {pageError ? (
          <p
            className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {pageError}
          </p>
        ) : null}

        {showAdminMemberTools && pendingJoinRows.length > 0 ? (
          <section className="mt-6 rounded-xl border border-splice-sky bg-white p-6 dark:border-splice-navy-light dark:bg-splice-navy">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
              Pending join requests
            </h2>
            <p className="mt-2 text-xs text-splice-blue dark:text-splice-water">
              Approve or decline people who asked to join this club. New members join as sailors.
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
                  <tr>
                    <th className="px-4 py-3 font-medium text-splice-ocean dark:text-splice-water">Display name</th>
                    <th className="px-4 py-3 font-medium text-splice-ocean dark:text-splice-water">Requested</th>
                    <th className="px-4 py-3 font-medium text-splice-ocean dark:text-splice-water">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-splice-sky bg-white dark:divide-splice-navy-light dark:bg-splice-navy">
                  {pendingJoinRows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 text-splice-navy dark:text-splice-foam">
                        {joinRequestNameByUser.get(r.user_id) ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-splice-ocean dark:text-splice-water">
                        {formatClubDateTimeMediumShort(r.created_at, clubTz)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <form action={approveJoinRequestAction} className="inline">
                            <input type="hidden" name="group_id" value={id} />
                            <input type="hidden" name="request_id" value={r.id} />
                            <button
                              type="submit"
                              className="rounded-lg bg-splice-navy px-3 py-1.5 text-xs font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
                            >
                              Approve
                            </button>
                          </form>
                          <form action={declineJoinRequestAction} className="inline">
                            <input type="hidden" name="group_id" value={id} />
                            <input type="hidden" name="request_id" value={r.id} />
                            <button
                              type="submit"
                              className="rounded-lg border border-splice-water px-3 py-1.5 text-xs font-medium text-splice-navy-light dark:border-splice-ocean dark:text-splice-sky"
                            >
                              Decline
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {workMode !== "sailor" ? (
          <ClubSeriesMaintenanceSection
            groupId={id}
            isAdmin={isAdmin}
            workMode={workMode}
            canMaintainSeries={canMaintainSeries}
            series={maintenanceSeriesRows}
          />
        ) : null}



        {membersError ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
            {membersError.message}
          </p>
        ) : (
          <section className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
              Members
            </h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-splice-sky bg-white dark:border-splice-navy-light dark:bg-splice-navy">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
                  <tr>
                    <th className="px-4 py-3 font-medium text-splice-ocean dark:text-splice-water">
                      Display name
                    </th>
                    <th className="px-4 py-3 font-medium text-splice-ocean dark:text-splice-water">Role</th>
                    {showAdminMemberTools ? (
                      <th className="px-4 py-3 font-medium text-splice-ocean dark:text-splice-water">
                        Actions
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-splice-sky dark:divide-splice-navy-light">
                  {(memberRows ?? []).map((m) => (
                    <tr key={m.user_id}>
                      <td className="px-4 py-3 text-splice-navy dark:text-splice-foam">
                        {nameByUser.get(m.user_id) ?? "—"}
                        {m.user_id === user.id ? (
                          <span className="ml-2 text-xs text-splice-blue">(you)</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-splice-ocean dark:text-splice-water">
                        {membershipRoleLabel(m.role, clubAdminWithSeriesBoats.has(m.user_id))}
                      </td>
                      {showAdminMemberTools ? (
                        <td className="px-4 py-3">
                          {m.role !== "club_admin" ? (
                            <form action={promoteToClubAdminAction} className="inline">
                              <input type="hidden" name="group_id" value={id} />
                              <input type="hidden" name="member_user_id" value={m.user_id} />
                              <button
                                type="submit"
                                className="text-xs font-medium text-splice-ocean underline-offset-4 hover:underline dark:text-splice-water"
                              >
                                Make club admin
                              </button>
                            </form>
                          ) : (
                            <span className="text-xs text-splice-water">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!showAdminMemberTools ? (
              <p className="mt-4 text-xs text-splice-blue dark:text-splice-water">
                Ask your club admin if you need access, or search for the club on My Entries and request to join.
              </p>
            ) : (
              <p className="mt-4 text-xs text-splice-blue dark:text-splice-water">
                New sailors can request to join from My Entries. Approve pending requests above to add them as members.
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
