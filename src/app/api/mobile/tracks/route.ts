import { NextResponse } from "next/server";
import { createMobileTrackSubmission } from "@/lib/mobile/track-submissions";
import { authenticateMobileRequest } from "@/lib/supabase/mobile-route";

type TrackBody = {
  raceEntryId?: string;
  activityStartedAt?: string;
  activityEndedAt?: string;
  activityName?: string;
  localSessionId?: string;
  garminActivityExternalId?: string;
};

/** Alias for mobile track session registration (FIT upload follows in a later step). */
export async function POST(request: Request) {
  try {
    const auth = await authenticateMobileRequest(request);
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as TrackBody;
    const result = await createMobileTrackSubmission(auth.supabase, auth.userId, {
      raceEntryId: String(body.raceEntryId ?? ""),
      activityStartedAt: String(body.activityStartedAt ?? ""),
      activityEndedAt: String(body.activityEndedAt ?? ""),
      activityName: body.activityName,
      localSessionId: body.localSessionId,
      garminActivityExternalId: body.garminActivityExternalId,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, submissionId: result.submissionId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
