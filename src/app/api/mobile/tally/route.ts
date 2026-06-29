import { NextResponse } from "next/server";
import { bumpTally } from "@/lib/tally/bump-tally";
import { authenticateMobileRequest } from "@/lib/supabase/mobile-route";

type TallyBody = {
  groupId?: string;
  seriesId?: string;
  raceId?: string;
  boatId?: string;
  which?: "afloat" | "ashore";
  outcome?: string;
};

export async function POST(request: Request) {
  try {
    const auth = await authenticateMobileRequest(request);
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as TallyBody;
    const groupId = String(body.groupId ?? "").trim();
    const seriesId = String(body.seriesId ?? "").trim();
    const raceId = String(body.raceId ?? "").trim();
    const boatId = String(body.boatId ?? "").trim();
    const which = body.which;

    if (which !== "afloat" && which !== "ashore") {
      return NextResponse.json({ ok: false, error: "Invalid tally action." }, { status: 400 });
    }

    const result = await bumpTally(auth.supabase, {
      groupId,
      seriesId,
      raceId,
      boatId,
      userId: auth.userId,
      which,
      outcome: body.outcome,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, raceEntryId: result.raceEntryId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
