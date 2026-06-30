# GPS track analysis (Sailstats integration)

Splice embeds the Sailstats analysis engine for post-race GPS insight. Sailors upload GPX/FIT files or sync Strava activities; tracks are matched to club races, then analysed either **standalone** (personal setup) or **collated** (RO-confirmed course, fleet tracks).

## Routes

| Path | Who | Purpose |
|------|-----|---------|
| `/tracks` | Sailor | Submission hub |
| `/tracks/new` | Sailor | Upload or Strava pick |
| `/tracks/[id]` | Sailor | Confirm race/boat, choose mode, setup |
| `/tracks/[id]/analysis` | Sailor | Results when `ready` |
| `/groups/[id]/club-admin/sailing-area` | Club admin | Marks & courses |
| `…/races/[raceId]/track-analysis` | RO / admin | Per-fleet course/laps/mark setup & analyse collated tracks |

## Strava

Reuse the **same Strava API application** as standalone Sailstats (client ID `226748` in `sailstats/wrangler.toml` / Cloudflare Worker `sailstats-auth`).

Set in `.env.local` (and production host env):

- `STRAVA_CLIENT_ID` — from [strava.com/settings/api](https://www.strava.com/settings/api)
- `STRAVA_CLIENT_SECRET` — same secret as the Sailstats Worker (dashboard → **Encrypt**, not in git)
- `NEXT_PUBLIC_APP_URL` — local: `http://localhost:3000`; production defaults to **`https://splicesail.com`**. Strava callback: `{origin}/api/strava/callback`

Strava allows `localhost` redirect URIs alongside the Sailstats GitHub Pages domain, so local Splice dev can share the app. For **production** Splice on a new domain, you may need to change the app’s **Authorization Callback Domain** on Strava (one domain per app) or accept using localhost-only until then.

- Link on **Account** → `/api/strava/authorize` → callback stores tokens in `user_strava_connections`
- Activities proxy: `/api/strava/activities`, streams: `/api/strava/streams/[id]`

## Submission status flow

```
pending_confirm → pending_mode → pending_setup → ready   (standalone)
                              → pending_ro → ready       (collated)
```

Collated mode requires `profiles.share_track_for_enhanced_analytics` and at least one club course (non-custom). The RO confirms **course letter and laps per race fleet** on the track-analysis page (preset before uploads is supported); mark drag positions are stored in `race_fleet_analysis_settings.mark_overrides`. Fleet assignment uses the tagged boat matched to `race_fleets` rules (class or PY), same as Manage — a series signup alone is enough once race fleets exist on the race.

### Tack / gybe and wind (analysis engine)

Implemented in [`src/lib/sailing-analysis/engine-core.ts`](../src/lib/sailing-analysis/engine-core.ts) with helpers in [`geo-heading.ts`](../src/lib/sailing-analysis/geo-heading.ts) and [`course-wind-baseline.ts`](../src/lib/sailing-analysis/course-wind-baseline.ts):

- **Course direction:** `heading` / `hdg` when present on track points (phone attitude sidecar), else GPS **COG** — used for manoeuvre detection, tack/gybe classification, and VMG.
- **Baseline wind:** when RO sets **windward mark** on the course, true-wind **FROM** is seeded from the course axis (bearing windward → previous mark, reversed). RO `wind_direction` overrides when set; otherwise auto-refinement from upwind segments and opposite-tack geometry still applies.
- **Tack vs gybe:** [`manoeuvre-wind-crossing.ts`](../src/lib/sailing-analysis/manoeuvre-wind-crossing.ts) — **only** wind-axis crossings in the turn window. **Tack** = course direction crosses head-to-wind (0° relative to wind FROM), both legs upwind (`|TWA| < 90°`), port/starboard side flips. **Gybe** = crosses dead downwind (180° relative), both legs downwind, side flips. No proximity-only or large-angle fallbacks.

### Automatic track → race matching

Implemented in [`src/lib/track-race-matching.ts`](../src/lib/track-race-matching.ts):

- **Window start:** `races.scheduled_at` minus the series **`tally_open_hours_before_fleet_start`** (default **2 hours** if unset).
- **Window end:** `races.scheduled_at` plus **4 hours** (max assumed race length).
- **Rule:** the Strava/upload activity interval must **overlap** that window by any amount (`overlap > 0`). There is no minimum overlap duration.
- **Preference:** among qualifying races, one where the sailor already has a `race_entries` row ranks first.
- Strava import auto-picks the top candidate; sailors can override on `/tracks/[id]` confirm step.

## Analysis code

Engine ported from Sailstats into [`src/lib/sailing-analysis/engine-core.ts`](../src/lib/sailing-analysis/engine-core.ts). Public entry: `executeAnalysis()` in `run-analysis-wrapper.ts`.

## Mobile API (Splice Phone)

Bearer token auth (`Authorization: Bearer <supabase_access_token>`). Implemented in [`src/lib/supabase/mobile-route.ts`](../src/lib/supabase/mobile-route.ts).

When `SPLICE_UNDER_DEVELOPMENT=1` on production, `/api/mobile/*` remains reachable for the phone app; sign in on the web to access RO pages such as track analysis.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/mobile/next-race` | Featured race + tally board (boats, fleet start, postponement) |
| POST | `/api/mobile/tally` | Tally afloat / ashore / undo afloat |
| GET | `/api/mobile/recent-results` | Sailor's recent race finishes (position or elapsed/corrected) |
| GET | `/api/mobile/track-submissions` | List track submissions; `?id=` for detail + `race_track_analyses` |
| POST | `/api/mobile/tracks` | Register phone session → `race_track_submissions` draft linked to `race_entry_id` |
| GET | `/api/mobile/race-context/[raceEntryId]` | Finish + linked track analysis for one entry |
| GET | `/api/mobile/races/[raceId]/fleet-analyses` | Collated fleet peers (privacy-gated) |
| POST | `/api/mobile/races/[raceId]/fleet-analyses` | Two-boat compare (`leftSubmissionId`, `rightSubmissionId`) |

Shared libs: [`src/lib/mobile/`](../src/lib/mobile/), compare math in [`compare-analyses.ts`](../src/lib/sailing-analysis/compare-analyses.ts).

## Race context & fleet compare (web)

| Path | Purpose |
|------|---------|
| `…/races/[raceId]/entries/[raceEntryId]/context` | Race result + track analysis hub per `race_entry_id` |
| `…/races/[raceId]/track-compare` | Two-boat fleet compare (collated, same fleet, `ready`) |

## Notifications

In-app only (phase 1): home dashboard banner and **Tracks** nav badge when analysis is `ready` and `ready_notified_at` is null. Email deferred.

## Privacy

- Standalone analyses: owner only (RLS on submissions + analyses)
- Collated peer track visibility: same-race participants with sharing enabled (`share_track_for_enhanced_analytics`)
- RO/staff: read collated submissions and all analyses for their club races

See [data-model.md](./data-model.md) for tables and [security-and-rls.md](./security-and-rls.md) for policies.

## WSC marks and courses

Migration [`20261703120000_seed_wsc_sailing_area.sql`](../supabase/migrations/20261703120000_seed_wsc_sailing_area.sql) adds `seed_wsc_sailing_area(group_id)` — 23 chart marks and 24 courses (A–Y plus CUSTOM), matching the WSC Course Selector / Sailstats data.

On migrate, any club with slug `warsash`, `wsc`, or `warsash-sc`, or a name containing “Warsash”, is seeded automatically (skipped if marks already exist).

Other clubs: club admin → **Sailing area → Import WSC default marks & courses** (calls the same DB function).
