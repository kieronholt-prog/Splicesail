import { NextResponse } from "next/server";
import { stravaConfig } from "@/lib/strava";

export async function GET() {
  const { clientId, redirectUri } = stravaConfig();
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "activity:read_all");
  url.searchParams.set("approval_prompt", "auto");
  return NextResponse.redirect(url.toString());
}
