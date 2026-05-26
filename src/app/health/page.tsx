import { createClient } from "@/lib/supabase/server";

export default async function HealthPage() {
  let body: Record<string, unknown>;

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").select("id").limit(1);

    if (error) {
      const missingRelation =
        error.message.includes("does not exist") ||
        error.message.includes("schema cache");
      body = {
        ok: false,
        supabase: "error",
        message: error.message,
        ...(missingRelation && {
          hint: "Apply migrations: supabase db push (remote) or supabase db reset (local).",
        }),
      };
    } else {
      body = {
        ok: true,
        supabase: "reachable",
        profiles: "queried",
      };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    body = { ok: false, supabase: "unconfigured", message };
  }

  const json = JSON.stringify(body, null, 2);

  return (
    <main className="min-h-full bg-splice-surface p-6 font-mono text-sm text-splice-navy dark:bg-splice-navy dark:text-splice-foam">
      <h1 className="mb-4 text-lg font-semibold tracking-tight">
        Splice · health
      </h1>
      <p className="mb-4 max-w-xl text-splice-ocean dark:text-splice-water">
        Cursor&apos;s embedded browser often looks blank for JSON-only routes.
        This page renders the same check as HTML. JSON endpoint:{" "}
        <a className="text-splice-blue underline dark:text-splice-water" href="/api/health">
          /api/health
        </a>
        . Use lowercase <code className="rounded bg-splice-sky px-1 dark:bg-splice-navy-light">/health</code>.
      </p>
      <pre className="overflow-x-auto rounded-lg border border-splice-sky bg-white p-4 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        {json}
      </pre>
    </main>
  );
}
