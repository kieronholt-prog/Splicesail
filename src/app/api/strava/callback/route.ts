import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { stravaConfig } from "@/lib/strava";

export async function GET(request: Request) {
  const { supabase, user } = await getServerAuth();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const code = new URL(request.url).searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL("/account?error=" + encodeURIComponent("Strava authorization was cancelled."), request.url),
    );
  }

  const { clientId, clientSecret, redirectUri } = stravaConfig();
  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    athlete?: { id: number; firstname?: string; lastname?: string; profile?: string };
    message?: string;
  };

  if (!tokenRes.ok || !tokenData.access_token || !tokenData.athlete?.id) {
    return NextResponse.redirect(
      new URL(
        "/account?error=" + encodeURIComponent(tokenData.message ?? "Strava link failed."),
        request.url,
      ),
    );
  }

  const row = {
    user_id: user.id,
    strava_athlete_id: tokenData.athlete.id,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token ?? "",
    token_expires_at: new Date((tokenData.expires_at ?? 0) * 1000).toISOString(),
    firstname: tokenData.athlete.firstname ?? null,
    lastname: tokenData.athlete.lastname ?? null,
    profile_pic: tokenData.athlete.profile ?? null,
    updated_at: new Date().toISOString(),
  };

  await supabase.from("user_strava_connections").upsert(row, { onConflict: "user_id" });

  return NextResponse.redirect(new URL("/account?strava_linked=1", request.url));
}
