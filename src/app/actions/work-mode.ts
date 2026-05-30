"use server";

import { cookies } from "next/headers";
import {
  WORK_MODE_COOKIE,
  parseWorkModeCookie,
  type WorkMode,
} from "@/lib/work-mode";

export async function setWorkModeAction(formData: FormData): Promise<{ mode: WorkMode }> {
  const targetRaw = formData.get("target");
  const availableRaw = formData.get("available");

  const target = parseWorkModeCookie(typeof targetRaw === "string" ? targetRaw : undefined);
  const available = (typeof availableRaw === "string" ? availableRaw.split(",") : [])
    .map((m) => parseWorkModeCookie(m))
    .filter((m): m is WorkMode => m != null);
  const modes: WorkMode[] = available.length ? available : ["sailor"];

  const next = target && modes.includes(target) ? target : modes[0] ?? "sailor";
  const cookieStore = await cookies();
  cookieStore.set(WORK_MODE_COOKIE, next, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  return { mode: next };
}
