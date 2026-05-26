import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DelinkSailorResultsPanel } from "@/components/delink-sailor-results-panel";
import {
  loadDelinkBoatClassOptionsForGroup,
  searchDelinkableSailorResults,
} from "@/lib/delink-sailor-results";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    delinked?: string;
    sail?: string;
    class?: string;
  }>;
};

export default async function DelinkSailorResultsPage({ params, searchParams }: Props) {
  const { id: groupId } = await params;
  const q = await searchParams;
  const errorParam = q.error ? decodeURIComponent(q.error) : null;
  const delinkedCount = q.delinked ? Number.parseInt(q.delinked, 10) : 0;
  const initialSailNumber = q.sail ? decodeURIComponent(q.sail) : "";
  const initialClassKey = q.class ? decodeURIComponent(q.class) : "";

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .select("id, name, iana_timezone")
    .eq("id", groupId)
    .maybeSingle();

  if (groupErr || !group) notFound();

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me?.role !== "club_admin") {
    redirect(
      `/groups/${groupId}?error=` +
        encodeURIComponent("Only club administrators can de-link sailor results."),
    );
  }

  const [classOptions, initialRows] = await Promise.all([
    loadDelinkBoatClassOptionsForGroup(supabase, groupId),
    initialSailNumber && initialClassKey
      ? searchDelinkableSailorResults(supabase, groupId, initialSailNumber, initialClassKey)
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="relative mx-auto w-full max-w-3xl rounded-xl border border-splice-sky bg-white p-8 pt-10 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
              De-link Result &amp; Sailor
            </h1>
            <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">{group.name}</p>
          </div>
          <Link
            href={`/groups/${groupId}/club-admin`}
            className="rounded-lg border border-splice-water px-3 py-1.5 text-sm font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-sky"
          >
            Back to club admin
          </Link>
        </div>

        {errorParam ? (
          <p
            className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {errorParam}
          </p>
        ) : null}

        {delinkedCount > 0 ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            {delinkedCount} result{delinkedCount === 1 ? "" : "s"} restored to race-only RO-added boats.
          </p>
        ) : null}

        <div className="mt-8">
          <DelinkSailorResultsPanel
            groupId={groupId}
            clubTz={group.iana_timezone ?? "Europe/London"}
            classOptions={classOptions}
            initialSailNumber={initialSailNumber}
            initialClassKey={initialClassKey}
            initialRows={initialRows}
          />
        </div>
      </main>
    </div>
  );
}
