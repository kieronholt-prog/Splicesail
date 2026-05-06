import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Machine-readable probe (curl, monitoring).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").select("id").limit(1);

    if (error) {
      const missingRelation =
        error.message.includes("does not exist") ||
        error.message.includes("schema cache");
      return NextResponse.json(
        {
          ok: false,
          supabase: "error",
          message: error.message,
          hint: missingRelation
            ? "Apply migrations: supabase db push (remote) or supabase db reset (local)."
            : undefined,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      supabase: "reachable",
      profiles: "queried",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { ok: false, supabase: "unconfigured", message },
      { status: 503 },
    );
  }
}
