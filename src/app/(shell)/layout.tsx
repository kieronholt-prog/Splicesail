import { Suspense } from "react";
import { headers } from "next/headers";
import { SiteNav, SiteNavFallback } from "@/components/site-nav";
import { WorkModeShell } from "@/components/work-mode-shell";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { fetchStaffMemberships, readWorkModeForUser } from "@/lib/work-mode-cookie";

export default async function ShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { supabase, user } = await getServerAuth();
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "/";
  const staffMemberships = user ? await fetchStaffMemberships(supabase, user.id) : [];
  const { mode } = await readWorkModeForUser(user?.id ?? null, staffMemberships, pathname);

  return (
    <WorkModeShell mode={mode}>
      <Suspense fallback={<SiteNavFallback />}>
        <SiteNav />
      </Suspense>
      {children}
    </WorkModeShell>
  );
}
