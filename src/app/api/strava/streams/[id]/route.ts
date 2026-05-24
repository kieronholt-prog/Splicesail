import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { fetchStravaTrackPoints, getStravaConnection } from "@/lib/strava";

type Props = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Props) {
  const { id } = await params;
  const { supabase, user } = await getServerAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conn = await getStravaConnection(supabase, user.id);
  if (!conn) {
    return NextResponse.json({ error: "Strava not linked" }, { status: 400 });
  }

  try {
    const points = await fetchStravaTrackPoints(conn, id);
    return NextResponse.json({ points });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load track streams";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
