"use server";

import { loadComparePair } from "@/lib/mobile/fleet-analyses";
import { getServerAuth } from "@/lib/supabase/auth-cache";

export async function loadFleetComparePairAction(leftId: string, rightId: string) {
  const { supabase, user } = await getServerAuth();
  if (!user) return null;
  return loadComparePair(supabase, user.id, leftId.trim(), rightId.trim());
}
