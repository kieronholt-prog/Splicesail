import Link from "next/link";
import { HomeDashboard } from "@/components/home-dashboard";
import { SpliceWordmark, SPLICE_TAGLINE } from "@/components/splice-brand";
import { getServerAuth } from "@/lib/supabase/auth-cache";

type Props = {
  searchParams: Promise<{
    error?: string;
    afloat?: string;
    ashore?: string;
    details_saved?: string;
    outcome_saved?: string;
  }>;
};

export default async function Home({ searchParams }: Props) {
  const { user } = await getServerAuth();

  if (user) {
    const q = await searchParams;
    const errorDecoded = q.error ? decodeURIComponent(q.error) : null;
    return (
      <HomeDashboard
        userId={user.id}
        homeQuery={{
          error: errorDecoded ?? undefined,
          tallyAfloat: q.afloat === "1",
          tallyAshore: q.ashore === "1",
          detailsSaved: q.details_saved === "1",
          outcomeSaved: q.outcome_saved === "1",
        }}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-splice-navy px-4 py-16">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <div>
          <SpliceWordmark mode="dark" showTagline className="scale-125 origin-left" />
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-splice-water">{SPLICE_TAGLINE}</p>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-splice-sky">
            Club dinghy racing for sailors, club admins, and race officials. Sign in to see your boats,
            clubs, series, and race activity.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-splice-blue px-5 py-2.5 text-sm font-medium text-white transition hover:bg-splice-ocean"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-splice-water px-5 py-2.5 text-sm font-medium text-splice-foam transition hover:border-splice-sky hover:bg-splice-navy-light"
          >
            Log in
          </Link>
        </div>
      </main>
    </div>
  );
}
