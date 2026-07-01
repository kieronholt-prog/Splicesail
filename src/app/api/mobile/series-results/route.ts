import { NextResponse } from "next/server";
import { loadMobileSeriesResults } from "@/lib/mobile/series-results";
import { authenticateMobileRequest } from "@/lib/supabase/mobile-route";

export async function GET(request: Request) {
  try {
    const auth = await authenticateMobileRequest(request);
    if (!auth.ok) return auth.response;

    const series = await loadMobileSeriesResults(auth.supabase, auth.userId);
    return NextResponse.json({ ok: true, series });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
