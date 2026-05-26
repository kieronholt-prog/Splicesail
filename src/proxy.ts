import { createServerClient } from "@supabase/ssr";
import { underDevelopmentGate } from "@/lib/under-development";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const gated = underDevelopmentGate(request);
  if (gated) return gated;

  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
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

  await supabase.auth.getUser();

  supabaseResponse.headers.set("x-pathname", request.nextUrl.pathname);
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
