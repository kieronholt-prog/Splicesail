import { NextResponse } from "next/server";
import { loadRaceContext } from "@/lib/mobile/race-context";
import { authenticateMobileRequest } from "@/lib/supabase/mobile-route";

function appOrigin(request: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://splicesail.com";
}

type Params = { params: Promise<{ raceEntryId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const auth = await authenticateMobileRequest(request);
    if (!auth.ok) return auth.response;

    const { raceEntryId } = await params;
    const context = await loadRaceContext(
      auth.supabase,
      auth.userId,
      raceEntryId,
      appOrigin(request),
    );

    if (!context) {
      return NextResponse.json({ ok: false, error: "Race entry not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, context });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
