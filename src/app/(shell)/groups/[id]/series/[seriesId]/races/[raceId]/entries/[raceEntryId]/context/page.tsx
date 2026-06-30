import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RaceContextPanel } from "@/components/sailing-analysis/race-context-panel";
import { loadRaceContext } from "@/lib/mobile/race-context";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  params: Promise<{ id: string; seriesId: string; raceId: string; raceEntryId: string }>;
};

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://splicesail.com").replace(/\/$/, "");
}

export default async function RaceContextPage({ params }: Props) {
  const { id: groupId, seriesId, raceId, raceEntryId } = await params;
  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const context = await loadRaceContext(supabase, user.id, raceEntryId, appOrigin());
  if (!context || context.raceId !== raceId || context.groupId !== groupId || context.seriesId !== seriesId) {
    notFound();
  }

  const trackCompareHref = `/groups/${groupId}/series/${seriesId}/races/${raceId}/track-compare?raceEntryId=${raceEntryId}`;

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-2xl rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <div className="mb-6">
          <Link
            href={`/groups/${groupId}/series/${seriesId}/races/${raceId}/finishes`}
            className="text-sm text-splice-navy-light underline dark:text-splice-water"
          >
            ← Race results
          </Link>
        </div>
        <RaceContextPanel
          context={context}
          groupId={groupId}
          seriesId={seriesId}
          trackCompareHref={trackCompareHref}
        />
      </main>
    </div>
  );
}
