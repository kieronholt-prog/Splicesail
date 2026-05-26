import { headers } from "next/headers";
import {
  configuredAppOrigin,
  isProductionAppHost,
  LOCAL_DEV_APP_ORIGIN,
  PRODUCTION_APP_ORIGIN,
} from "@/lib/app-url";

/** Public app origin for OAuth, calendar subscribe URLs, etc. */
export async function appOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return configuredAppOrigin();
  }
  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_APP_ORIGIN;
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host && isProductionAppHost(host)) {
    return PRODUCTION_APP_ORIGIN;
  }
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }

  return LOCAL_DEV_APP_ORIGIN;
}

export function httpsToWebcalUrl(httpsUrl: string): string {
  return httpsUrl.replace(/^https:\/\//i, "webcal://");
}

export function googleCalendarSubscribeUrl(httpsFeedUrl: string): string {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(httpsFeedUrl)}`;
}

export function outlookCalendarSubscribeUrl(webcalFeedUrl: string, calendarName: string): string {
  return `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(webcalFeedUrl)}&name=${encodeURIComponent(calendarName)}`;
}

export function seriesCalendarFeedPath(token: string): string {
  return `/api/calendar/feeds/${token}`;
}
