import { NextResponse } from "next/server";
import { loadMobileRecentResults } from "@/lib/mobile/recent-results";
import { authenticateMobileRequest } from "@/lib/supabase/mobile-route";

export async function GET(request: Request) {
  try {
    const auth = await authenticateMobileRequest(request);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 25) || 25));

    const results = await loadMobileRecentResults(auth.supabase, auth.userId, limit);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
