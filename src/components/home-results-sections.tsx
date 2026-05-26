import { HomeBoatRaceResultsTable } from "@/components/home-boat-race-results-table";
import { HomeRecentRaceResultsTable } from "@/components/home-recent-race-results-table";
import { fetchHomeBoatRaceResults } from "@/lib/home-boat-race-results";
import { fetchHomeRecentRaceResults } from "@/lib/home-recent-race-results";
import { getServerAuth } from "@/lib/supabase/auth-cache";

export function HomeResultsSectionsFallback() {
  return (
    <div className="flex flex-col gap-8">
      {[1, 2].map((key) => (
        <section
          key={key}
          className="animate-pulse rounded-xl border border-splice-sky bg-white p-6 dark:border-splice-navy-light dark:bg-splice-navy"
        >
          <div className="h-4 w-40 rounded bg-splice-sky dark:bg-splice-ocean" />
          <div className="mt-4 h-24 rounded-lg bg-splice-surface dark:bg-splice-navy-light" />
        </section>
      ))}
    </div>
  );
}

export async function HomeResultsSections({ userId }: { userId: string }) {
  const { supabase } = await getServerAuth();

  const { data: regRows } = await supabase
    .from("series_registrations")
    .select("series_id")
    .eq("user_id", userId);

  const registeredSeriesIds = [...new Set((regRows ?? []).map((r) => r.series_id))];

  let seriesBase: { seriesId: string; seriesName: string; clubName: string; groupId: string }[] = [];

  if (registeredSeriesIds.length > 0) {
    const { data: seriesRowsNest } = await supabase
      .from("series")
      .select(
        `
        id,
        name,
        group_id,
        groups ( id, name, iana_timezone )
      `,
      )
      .in("id", registeredSeriesIds);

    seriesBase = (seriesRowsNest ?? [])
      .map((raw) => {
        const s = raw as {
          id: string;
          name: string;
          group_id: string;
          groups?:
            | { name?: string | null; iana_timezone?: string | null }
            | ({ name?: string | null; iana_timezone?: string | null } | null)[]
            | null;
        };
        const gRaw = s.groups;
        const gOne = Array.isArray(gRaw) ? gRaw[0] : gRaw;
        const nm =
          gOne && typeof gOne === "object" && gOne !== null && typeof (gOne as { name?: unknown }).name === "string"
            ? String((gOne as { name: string }).name).trim()
            : "";
        return {
          seriesId: s.id,
          seriesName: s.name,
          groupId: s.group_id,
          clubName: nm.length ? nm : "Club",
        };
      })
      .sort(
        (a, b) =>
          a.clubName.localeCompare(b.clubName, undefined, { sensitivity: "base" }) ||
          a.seriesName.localeCompare(b.seriesName, undefined, { sensitivity: "base" }),
      );
  }

  const seriesIds = seriesBase.map((s) => s.seriesId);

  const [recentRaceResults, boatRaceResults] = await Promise.all([
    seriesIds.length > 0 ? fetchHomeRecentRaceResults(supabase, userId, seriesIds) : Promise.resolve(null),
    seriesBase.length > 0 ? fetchHomeBoatRaceResults(supabase, userId, seriesBase) : Promise.resolve([]),
  ]);

  return (
    <>
      <section className="rounded-xl border border-splice-sky bg-white p-6 dark:border-splice-navy-light dark:bg-splice-navy">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
          My latest race results
        </h2>
        {recentRaceResults ? (
          <HomeRecentRaceResultsTable results={recentRaceResults} />
        ) : (
          <p className="mt-3 text-sm text-splice-ocean dark:text-splice-water">
            No recorded race finishes in your series yet. When a race officer logs finishes, the latest race ranking
            appears here.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-splice-sky bg-white p-6 dark:border-splice-navy-light dark:bg-splice-navy">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
          My series results
        </h2>
        {boatRaceResults.length > 0 ? (
          <HomeBoatRaceResultsTable groups={boatRaceResults} />
        ) : (
          <p className="mt-3 text-sm text-splice-ocean dark:text-splice-water">
            No series standings yet. When your boats have recorded race finishes, overall positions appear here.
          </p>
        )}
      </section>
    </>
  );
}
