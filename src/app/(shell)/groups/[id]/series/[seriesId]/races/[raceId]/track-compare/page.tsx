import Link from "next/link";
import { redirect } from "next/navigation";
import { FleetCompareClient } from "@/components/sailing-analysis/fleet-compare-client";
import { loadComparePair, loadMobileFleetAnalyses } from "@/lib/mobile/fleet-analyses";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  params: Promise<{ id: string; seriesId: string; raceId: string }>;
  searchParams: Promise<{ raceEntryId?: string; a?: string; b?: string }>;
};

export default async function TrackComparePage({ params, searchParams }: Props) {
  const { id: groupId, seriesId, raceId } = await params;
  const q = await searchParams;
  const raceEntryId = q.raceEntryId?.trim() || null;

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const fleet = await loadMobileFleetAnalyses(supabase, user.id, raceId, {
    raceEntryId: raceEntryId ?? undefined,
  });

  async function loadPairAction(leftId: string, rightId: string) {
    "use server";
    const { supabase: sb, user: u } = await getServerAuth();
    if (!u) return null;
    return loadComparePair(sb, u.id, leftId, rightId);
  }

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-4xl rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <div className="mb-6">
          <Link
            href={`/groups/${groupId}/series/${seriesId}/races/${raceId}/track-analysis`}
            className="text-sm text-splice-navy-light underline dark:text-splice-water"
          >
            ← Track analysis
          </Link>
        </div>
        <h1 className="text-xl font-semibold text-splice-navy dark:text-splice-foam">Fleet compare</h1>
        <FleetCompareClient
          groupId={groupId}
          seriesId={seriesId}
          raceId={raceId}
          raceEntryId={raceEntryId}
          windDirection={fleet.windDirection}
          peers={fleet.peers}
          mySubmissionId={fleet.mySubmissionId}
          initialLeftId={q.a?.trim() || fleet.mySubmissionId}
          initialRightId={q.b?.trim() || null}
          loadPairAction={loadPairAction}
        />
      </main>
    </div>
  );
}
