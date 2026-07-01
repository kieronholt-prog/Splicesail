/**
 * Rebuild fleet wind grids from stored analysis snapshots (no full GPS re-analysis).
 *
 * Usage:
 *   node --import tsx --env-file=.env.local scripts/rebuild-fleet-wind-grids.ts
 *   node --import tsx --env-file=.env.local scripts/rebuild-fleet-wind-grids.ts --race-id=<uuid>
 */
import { createAdminClient } from "../src/lib/supabase/admin";
import {
  buildFleetWindGridForRaceFleet,
  persistFleetWindGrid,
} from "../src/lib/sailing-analysis/persist-fleet-wind-grid";

async function main() {
  const raceIdArg = process.argv.find((a) => a.startsWith("--race-id="))?.split("=")[1];

  const supabase = createAdminClient();

  let query = supabase
    .from("race_fleet_analysis_settings")
    .select("race_id, race_fleet_id, wind_direction, ro_confirmed_at")
    .not("ro_confirmed_at", "is", null);

  if (raceIdArg) {
    query = query.eq("race_id", raceIdArg);
  }

  const { data: fleets, error } = await query;
  if (error) {
    console.error("Failed to load fleet settings:", error.message);
    process.exit(1);
  }

  if (!fleets?.length) {
    console.log("No confirmed fleet analysis settings found.");
    return;
  }

  let rebuilt = 0;
  let empty = 0;
  let failed = 0;

  for (const fleet of fleets) {
    const label = `${fleet.race_id} / fleet ${fleet.race_fleet_id}`;
    try {
      const grid = await buildFleetWindGridForRaceFleet(supabase, {
        raceId: fleet.race_id,
        raceFleetId: fleet.race_fleet_id,
        referenceWindFromDeg: fleet.wind_direction,
      });
      await persistFleetWindGrid(supabase, fleet.race_fleet_id, grid);
      if (grid) {
        rebuilt++;
        console.log(`✓ ${label} — ${grid.cells.length} cells, ${grid.fleetMeanTackAngleDeg ?? "?"}° tack`);
      } else {
        empty++;
        console.log(`○ ${label} — insufficient upwind samples (grid cleared)`);
      }
    } catch (e) {
      failed++;
      console.error(`✗ ${label} —`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`\nDone: ${rebuilt} rebuilt, ${empty} empty, ${failed} failed (${fleets.length} fleets).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
