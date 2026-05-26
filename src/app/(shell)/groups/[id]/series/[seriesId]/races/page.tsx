import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SeriesCalendarSubscribePanel } from "@/components/series-calendar-subscribe-panel";
import { formatClubDdMmmYyyyFromIso, formatClubHmFromIso, formatPostgresDateDdMmmYyyy } from "@/lib/club-display-format";
import {
  appOrigin,
  googleCalendarSubscribeUrl,
  httpsToWebcalUrl,
  outlookCalendarSubscribeUrl,
  seriesCalendarFeedPath,
} from "@/lib/app-origin";
import { resolveClubIanaTimeZone } from "@/lib/club-time";
import { getOrCreateSeriesCalendarFeedToken } from "@/lib/series-calendar-feed";
import { raceTypeLabel, normalizeRaceType } from "@/lib/race-type";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  params: Promise<{ id: string; seriesId: string }>;
};

export default async function SeriesRaceListPage({ params }: Props) {
  const { id: groupId, seriesId } = await params;

  const { supabase, user } = await getServerAuth();
  if (!user) redirect("/login");

  const { data: series, error: seriesError } = await supabase
    .from("series")
    .select("id, group_id, name, starts_on, ends_on")
    .eq("id", seriesId)
    .maybeSingle();

  if (seriesError || !series || series.group_id !== groupId) {
    notFound();
  }

  const [{ data: group }, { data: me }, { data: races, error: racesError }] = await Promise.all([
    supabase.from("groups").select("name, iana_timezone").eq("id", groupId).maybeSingle(),
    supabase
      .from("group_memberships")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("races")
      .select("id, name, scheduled_at, race_type")
      .eq("series_id", seriesId)
      .order("scheduled_at", { ascending: true }),
  ]);

  if (!me) {
    redirect(`/groups/${groupId}?error=` + encodeURIComponent("Join this club to view the race list."));
  }

  const clubTz = resolveClubIanaTimeZone((group as { iana_timezone?: string | null } | null)?.iana_timezone);
  const dateRange =
    series.starts_on && series.ends_on
      ? `${formatPostgresDateDdMmmYyyy(series.starts_on)} – ${formatPostgresDateDdMmmYyyy(series.ends_on)}`
      : null;

  const feed = await getOrCreateSeriesCalendarFeedToken(supabase, {
    userId: user.id,
    groupId,
    seriesId,
  });

  const origin = await appOrigin();
  const downloadUrl = `/api/groups/${groupId}/series/${seriesId}/calendar?download=1`;
  const subscribeUrlHttps = feed.token
    ? `${origin}${seriesCalendarFeedPath(feed.token)}`
    : null;

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-2xl">
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          <Link
            href={`/groups#club-${groupId}`}
            className="text-splice-blue hover:underline dark:text-splice-water"
          >
            ← Series schedule
          </Link>
          <span className="mx-2 text-splice-water">·</span>
          <Link href="/groups" className="text-splice-blue hover:underline dark:text-splice-water">
            My Entries
          </Link>
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
              Race list
            </h1>
            <p className="mt-1 text-sm font-medium text-splice-navy dark:text-splice-foam">{series.name}</p>
            {dateRange ? (
              <p className="mt-0.5 text-xs tabular-nums text-splice-blue dark:text-splice-water">{dateRange}</p>
            ) : null}
            <p className="mt-1 text-xs text-splice-ocean dark:text-splice-water">{group?.name}</p>
          </div>
          {subscribeUrlHttps ? (
            <SeriesCalendarSubscribePanel
              groupId={groupId}
              seriesId={seriesId}
              seriesName={series.name}
              subscribeUrlHttps={subscribeUrlHttps}
              webcalUrl={httpsToWebcalUrl(subscribeUrlHttps)}
              googleCalendarUrl={googleCalendarSubscribeUrl(subscribeUrlHttps)}
              outlookCalendarUrl={outlookCalendarSubscribeUrl(httpsToWebcalUrl(subscribeUrlHttps), `${series.name} — ${group?.name ?? "Club"}`)}
              downloadUrl={downloadUrl}
            />
          ) : (
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <a href={downloadUrl} download className="inline-flex justify-center rounded-lg border border-splice-water px-3 py-2 text-sm font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam">
                Download .ics
              </a>
              {feed.error ? (
                <p className="max-w-[14rem] text-right text-[11px] text-red-700 dark:text-red-300">{feed.error}</p>
              ) : null}
            </div>
          )}
        </div>

        <section className="mt-8">
          {racesError ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
              {racesError.message}
            </p>
          ) : (
            <ul className="divide-y divide-splice-sky rounded-xl border border-splice-sky bg-white dark:divide-splice-navy-light dark:border-splice-navy-light dark:bg-splice-navy">
              {!races?.length ? (
                <li className="px-4 py-8 text-center text-sm text-splice-ocean dark:text-splice-water">
                  No races scheduled yet.
                </li>
              ) : (
                races.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="font-medium text-splice-navy dark:text-splice-surface">
                      {r.name}
                      <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-splice-ocean dark:text-splice-water">
                        {raceTypeLabel(normalizeRaceType((r as { race_type?: string }).race_type))}
                      </span>
                    </span>
                    <span className="text-sm tabular-nums text-splice-ocean dark:text-splice-water">
                      {formatClubDdMmmYyyyFromIso(r.scheduled_at, clubTz)} · Start{" "}
                      {formatClubHmFromIso(r.scheduled_at, clubTz)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
