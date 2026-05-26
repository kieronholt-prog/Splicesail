import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicClubResultsView } from "@/components/public-club-results-view";
import {
  fetchPublicClubResults,
  type PublicClubResultsFailure,
} from "@/lib/public-club-results";
import { createPublicResultsClient } from "@/lib/supabase/public-results";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ series?: string }>;
};

export default async function PublicClubResultsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const q = await searchParams;
  const seriesId = q.series?.trim() || null;

  let payload = null;
  let failure: PublicClubResultsFailure | null = null;
  let configError: string | null = null;

  try {
    const supabase = createPublicResultsClient();
    const result = await fetchPublicClubResults(supabase, slug, seriesId);
    if ("kind" in result) {
      failure = result;
    } else {
      payload = result;
    }
  } catch (e) {
    configError =
      e instanceof Error ? e.message : "Unable to load public results.";
  }

  if (configError) {
    return (
      <div className="flex min-h-full flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
        <main className="mx-auto w-full max-w-3xl">
          <h1 className="text-xl font-semibold text-splice-navy dark:text-splice-surface">Results unavailable</h1>
          <p className="mt-3 text-sm text-splice-ocean dark:text-splice-water">{configError}</p>
          <Link href="/" className="mt-6 inline-block text-sm font-medium text-splice-blue dark:text-splice-water">
            Splice home
          </Link>
        </main>
      </div>
    );
  }

  if (failure?.kind === "not_found") notFound();

  if (failure) {
    const message =
      failure.kind === "no_results"
        ? "This club has no published race results yet."
        : failure.message;
    return (
      <div className="flex min-h-full flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
        <main className="mx-auto w-full max-w-3xl">
          <h1 className="text-xl font-semibold text-splice-navy dark:text-splice-surface">Results unavailable</h1>
          <p className="mt-3 text-sm text-splice-ocean dark:text-splice-water">{message}</p>
          <Link href="/" className="mt-6 inline-block text-sm font-medium text-splice-blue dark:text-splice-water">
            Splice home
          </Link>
        </main>
      </div>
    );
  }

  if (!payload) notFound();

  return (
    <div className="flex min-h-full flex-col bg-splice-surface px-4 py-6 sm:py-8 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-6xl">
        <header className="border-b border-splice-sky pb-5 dark:border-splice-navy-light">
          <p className="text-xs font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
            Public results
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
            {payload.clubName}
          </h1>
        </header>

        <div className="mt-6">
          <PublicClubResultsView slug={slug} payload={payload} />
        </div>
      </main>
    </div>
  );
}
