import { NextResponse, type NextRequest } from "next/server";

const BYPASS_COOKIE = "splice_under_dev_bypass";

export function isUnderDevelopmentEnabled(): boolean {
  const value = process.env.SPLICE_UNDER_DEVELOPMENT?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function bypassSecret(): string | null {
  const secret = process.env.SPLICE_UNDER_DEVELOPMENT_BYPASS?.trim();
  return secret || null;
}

function isExemptPath(pathname: string): boolean {
  if (pathname === "/under-development") return true;
  if (pathname === "/health" || pathname.startsWith("/health/")) return true;
  if (pathname === "/api/health" || pathname.startsWith("/api/health/")) return true;
  if (pathname === "/api/club-approval") return true;
  if (pathname === "/api/mobile" || pathname.startsWith("/api/mobile/")) return true;
  return false;
}

function hasBypassCookie(request: NextRequest): boolean {
  const secret = bypassSecret();
  if (!secret) return false;
  return request.cookies.get(BYPASS_COOKIE)?.value === secret;
}

/** Returns a response to short-circuit the proxy, or null to continue normally. */
export function underDevelopmentGate(request: NextRequest): NextResponse | null {
  if (!isUnderDevelopmentEnabled()) return null;

  const pathname = request.nextUrl.pathname;
  const secret = bypassSecret();

  if (
    secret &&
    pathname === "/under-development" &&
    request.nextUrl.searchParams.get("bypass") === secret
  ) {
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set(BYPASS_COOKIE, secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return response;
  }

  if (isExemptPath(pathname) || hasBypassCookie(request)) return null;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Site under development" }, { status: 503 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/under-development";
  url.search = "";
  return NextResponse.rewrite(url);
}
