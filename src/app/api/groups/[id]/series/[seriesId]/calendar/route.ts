import { NextResponse } from "next/server";
import {
  buildSeriesCalendarIcsBody,
  loadSeriesCalendarSourceForMember,
  safeSeriesCalendarFilename,
} from "@/lib/series-calendar-feed";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string; seriesId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id: groupId, seriesId } = await context.params;
  const download = new URL(request.url).searchParams.get("download") === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("group_memberships")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Club membership required" }, { status: 403 });
  }

  const { source, error } = await loadSeriesCalendarSourceForMember(supabase, { groupId, seriesId });
  if (error || !source) {
    return NextResponse.json({ error: error ?? "Series not found" }, { status: 404 });
  }

  const body = buildSeriesCalendarIcsBody(source);
  const safeFilename = safeSeriesCalendarFilename(source.seriesName);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeFilename}.ics"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
