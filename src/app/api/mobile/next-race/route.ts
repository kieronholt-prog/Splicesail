import { NextResponse } from "next/server";
import { loadMobileNextRace } from "@/lib/mobile/next-race";
import { authenticateMobileRequest } from "@/lib/supabase/mobile-route";

export async function GET(request: Request) {
  try {
    const auth = await authenticateMobileRequest(request);
    if (!auth.ok) return auth.response;

    const payload = await loadMobileNextRace(auth.supabase, auth.userId);
    return NextResponse.json({ ok: true, race: payload });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
