import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/** True when this hull is linked to the sailor's signup for the series (not fleet-wide boats). */
export async function boatLinkedToSeriesSignup(
  supabase: Db,
  params: { seriesId: string; userId: string; boatId: string },
): Promise<boolean> {
  const { seriesId, userId, boatId } = params;
  if (!seriesId || !userId || !boatId) return false;
  const { data } = await supabase
    .from("series_registration_boats")
    .select("boat_id")
    .eq("series_id", seriesId)
    .eq("user_id", userId)
    .eq("boat_id", boatId)
    .maybeSingle();
  return !!data;
}
