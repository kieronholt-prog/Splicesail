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
| `…/races/[raceId]/track-analysis` | RO / admin | Fleet course setup & batch analyse |

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

Collated mode requires `profiles.share_track_for_enhanced_analytics` and at least one club course (non-custom).

## Analysis code

Engine ported from Sailstats into [`src/lib/sailing-analysis/engine-core.ts`](../src/lib/sailing-analysis/engine-core.ts). Public entry: `executeAnalysis()` in `run-analysis-wrapper.ts`.

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
