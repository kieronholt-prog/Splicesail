import { SpliceWordmark, SPLICE_TAGLINE } from "@/components/splice-brand";

export default function UnderDevelopmentPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-splice-navy px-4 py-16">
      <main className="mx-auto flex w-full max-w-lg flex-col items-start gap-6">
        <SpliceWordmark mode="dark" showTagline className="scale-110 origin-left" />
        <div className="rounded-xl border border-splice-ocean/40 bg-splice-navy-light/40 px-6 py-8">
          <h1 className="text-xl font-semibold tracking-tight text-splice-foam">Under development</h1>
          <p className="mt-3 text-sm leading-relaxed text-splice-water">
            {SPLICE_TAGLINE} We&apos;re finishing setup — the site will be back soon.
          </p>
          <p className="mt-4 text-xs text-splice-sky">
            Club dinghy racing for sailors, club admins, and race officers.
          </p>
        </div>
      </main>
    </div>
  );
}
