import { createServerClient } from "@supabase/ssr";
import {
  shouldGateUnderDevelopment,
  underDevelopmentBypassRedirect,
  underDevelopmentGateResponse,
} from "@/lib/under-development";
import { isStaffPath, WORK_MODE_COOKIE } from "@/lib/work-mode";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const bypassRedirect = underDevelopmentBypassRedirect(request);
  if (bypassRedirect) return bypassRedirect;

  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (shouldGateUnderDevelopment(request, false)) {
      return underDevelopmentGateResponse(request);
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (shouldGateUnderDevelopment(request, Boolean(user))) {
    return underDevelopmentGateResponse(request);
  }

  const pathname = request.nextUrl.pathname;
  if (user && !isStaffPath(pathname)) {
    const workMode = request.cookies.get(WORK_MODE_COOKIE)?.value;
    if (workMode && workMode !== "sailor") {
      supabaseResponse.cookies.set(WORK_MODE_COOKIE, "sailor", {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
  }

  supabaseResponse.headers.set("x-pathname", pathname);
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Skip static assets, image optimization, and cheap probes — they should not block on Auth refresh.
     * Health HTML + JSON are used for monitoring; session refresh belongs on authenticated app routes only.
     */
    "/((?!_next/static|_next/image|favicon.ico|health$|health/|api/health(?:/|$)|api/calendar/feeds(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
