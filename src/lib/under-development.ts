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
  if (pathname === "/login" || pathname === "/signup" || pathname === "/logout") return true;
  if (pathname === "/api/strava" || pathname.startsWith("/api/strava/")) return true;
  return false;
}

function hasBypassCookie(request: NextRequest): boolean {
  const secret = bypassSecret();
  if (!secret) return false;
  return request.cookies.get(BYPASS_COOKIE)?.value === secret;
}

/** Set bypass cookie when visiting `/under-development?bypass=SECRET`. */
export function underDevelopmentBypassRedirect(request: NextRequest): NextResponse | null {
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

  return null;
}

/** True when an unauthenticated visitor should see the under-development gate. */
export function shouldGateUnderDevelopment(request: NextRequest, isAuthenticated: boolean): boolean {
  if (!isUnderDevelopmentEnabled()) return false;
  const pathname = request.nextUrl.pathname;
  if (isExemptPath(pathname) || hasBypassCookie(request)) return false;
  if (isAuthenticated) return false;
  return true;
}

export function underDevelopmentGateResponse(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Site under development" }, { status: 503 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/under-development";
  url.search = "";
  return NextResponse.redirect(url);
}

/** @deprecated Use shouldGateUnderDevelopment + underDevelopmentGateResponse after auth check. */
export function underDevelopmentGate(request: NextRequest): NextResponse | null {
  const bypass = underDevelopmentBypassRedirect(request);
  if (bypass) return bypass;
  if (shouldGateUnderDevelopment(request, false)) {
    return underDevelopmentGateResponse(request);
  }
  return null;
}
