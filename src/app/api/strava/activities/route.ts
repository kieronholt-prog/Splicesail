import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { fetchStravaActivities, getStravaConnection } from "@/lib/strava";

export async function GET(request: Request) {
  const { supabase, user } = await getServerAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  const conn = await getStravaConnection(supabase, user.id);
  if (!conn) {
    return NextResponse.json({ linked: false, activities: [] });
  }

  try {
    const activities = await fetchStravaActivities(conn, page);
    return NextResponse.json({ linked: true, activities });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load Strava activities";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
