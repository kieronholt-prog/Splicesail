import { NextResponse } from "next/server";
import { compareAnalyses } from "@/lib/sailing-analysis/compare-analyses";
import { loadComparePair, loadMobileFleetAnalyses } from "@/lib/mobile/fleet-analyses";
import { authenticateMobileRequest } from "@/lib/supabase/mobile-route";

type Params = { params: Promise<{ raceId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const auth = await authenticateMobileRequest(request);
    if (!auth.ok) return auth.response;

    const { raceId } = await params;
    const url = new URL(request.url);
    const raceEntryId = url.searchParams.get("raceEntryId")?.trim() || undefined;
    const raceFleetId = url.searchParams.get("raceFleetId")?.trim() || undefined;

    const payload = await loadMobileFleetAnalyses(auth.supabase, auth.userId, raceId, {
      raceEntryId,
      raceFleetId: raceFleetId ?? null,
    });

    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

type CompareBody = {
  leftSubmissionId?: string;
  rightSubmissionId?: string;
};

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await authenticateMobileRequest(request);
    if (!auth.ok) return auth.response;

    await params;
    const body = (await request.json()) as CompareBody;
    const leftId = String(body.leftSubmissionId ?? "").trim();
    const rightId = String(body.rightSubmissionId ?? "").trim();
    if (!leftId || !rightId) {
      return NextResponse.json({ ok: false, error: "Two submission ids required." }, { status: 400 });
    }

    const pair = await loadComparePair(auth.supabase, auth.userId, leftId, rightId);
    if (!pair) {
      return NextResponse.json(
        { ok: false, error: "Could not load analyses for comparison." },
        { status: 404 },
      );
    }

    const compare = compareAnalyses(pair.left, pair.right);
    return NextResponse.json({ ok: true, compare });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
