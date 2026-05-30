import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import {
  WORK_MODE_COOKIE,
  parseWorkModeCookie,
  resolveWorkMode,
  resolveWorkModeCapabilities,
  staffRouteWorkMode,
  type WorkMode,
  type WorkModeCapabilities,
} from "@/lib/work-mode";

/** One staff-role query per RSC request (layout + pages share via React cache()). */
export const fetchStaffMemberships = cache(
  async (supabase: SupabaseServerClient, userId: string): Promise<{ role: string }[]> => {
    const { data } = await supabase
      .from("group_memberships")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["club_admin", "race_officer"]);
    return data ?? [];
  },
);

export async function readWorkModeForUser(
  userId: string | null,
  staffMemberships: { role: string }[],
  pathname?: string,
): Promise<{ mode: WorkMode; capabilities: WorkModeCapabilities }> {
  const capabilities = resolveWorkModeCapabilities(staffMemberships);
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(WORK_MODE_COOKIE)?.value;

  if (!userId) {
    return { mode: "sailor", capabilities };
  }

  const staffMode = pathname ? staffRouteWorkMode(pathname) : null;
  if (staffMode && capabilities.availableModes.includes(staffMode)) {
    return { mode: staffMode, capabilities };
  }

  return {
    mode: resolveWorkMode(cookieValue, capabilities, pathname),
    capabilities,
  };
}
