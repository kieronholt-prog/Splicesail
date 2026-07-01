import { NextResponse } from "next/server";
import {
  createMobileTrackSubmission,
  loadMobileTrackSubmissionDetail,
  loadMobileTrackSubmissions,
} from "@/lib/mobile/track-submissions";
import { authenticateMobileRequest } from "@/lib/supabase/mobile-route";

function appOrigin(request: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://splicesail.com";
}

export async function GET(request: Request) {
  try {
    const auth = await authenticateMobileRequest(request);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const submissionId = url.searchParams.get("id")?.trim();
    const origin = appOrigin(request);

    if (submissionId) {
      const detail = await loadMobileTrackSubmissionDetail(auth.supabase, auth.userId, submissionId, origin);
      if (!detail) {
        return NextResponse.json({ ok: false, error: "Track submission not found." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, submission: detail });
    }

    const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit") ?? 60) || 60));
    const submissions = await loadMobileTrackSubmissions(auth.supabase, auth.userId, limit);
    return NextResponse.json({ ok: true, submissions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

type TrackBody = {
  raceEntryId?: string;
  activityStartedAt?: string;
  activityEndedAt?: string;
  activityName?: string;
  localSessionId?: string;
  garminActivityExternalId?: string;
};

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
