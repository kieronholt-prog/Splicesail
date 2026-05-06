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
    <main className="min-h-full bg-zinc-50 p-6 font-mono text-sm text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <h1 className="mb-4 text-lg font-semibold tracking-tight">
        Race Manager · health
      </h1>
      <p className="mb-4 max-w-xl text-zinc-600 dark:text-zinc-400">
        Cursor&apos;s embedded browser often looks blank for JSON-only routes.
        This page renders the same check as HTML. JSON endpoint:{" "}
        <a className="text-blue-600 underline dark:text-blue-400" href="/api/health">
          /api/health
        </a>
        . Use lowercase <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">/health</code>.
      </p>
      <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {json}
      </pre>
    </main>
  );
}
