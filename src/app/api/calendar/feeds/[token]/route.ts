import { NextResponse } from "next/server";
import {
  buildSeriesCalendarIcsBody,
  fetchSeriesCalendarFeedPayload,
  safeSeriesCalendarFilename,
} from "@/lib/series-calendar-feed";
import { createAnonSupabaseClient } from "@/lib/supabase/anon";

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { token: rawToken } = await context.params;
  const token = rawToken.replace(/\.ics$/i, "").trim();

  if (!UUID_RX.test(token)) {
    return NextResponse.json({ error: "Invalid calendar feed." }, { status: 404 });
  }

  let supabase;
  try {
    supabase = createAnonSupabaseClient();
  } catch {
    return NextResponse.json({ error: "Calendar feeds unavailable." }, { status: 503 });
  }

  const source = await fetchSeriesCalendarFeedPayload(supabase, token);
  if (!source) {
    return NextResponse.json({ error: "Calendar feed not found." }, { status: 404 });
  }

  const body = buildSeriesCalendarIcsBody(source);
  const safeFilename = safeSeriesCalendarFilename(source.seriesName);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${safeFilename}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
