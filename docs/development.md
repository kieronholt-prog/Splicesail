# Development

## Prerequisites

- Node.js (version consistent with Vercel / team—see `package.json` engines if added)
- A Supabase project with migrations applied

## Environment variables

Required for the Next.js app:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon key for SSR client |

Optional:

| Variable | Description |
|----------|-------------|
| `STRAVA_CLIENT_ID` | Same Strava API app as standalone Sailstats (`226748` in `sailstats/wrangler.toml`) |
| `STRAVA_CLIENT_SECRET` | Client secret from that app (Cloudflare Worker encrypted secret, or Strava API settings) |
| `NEXT_PUBLIC_APP_URL` | Optional override for OAuth and **calendar subscribe links**. Local: `http://localhost:3000`. Production default: **`https://splicesail.com`** (`src/lib/app-url.ts`) when unset. Strava callback: `{origin}/api/strava/callback`. |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox public token for course-setup maps on track analysis pages (reuse `CONFIG.MAPBOX_TOKEN` from Sailstats). |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only: **`/api/club-approval`** token links update `groups.approval_status`; **never** expose publicly |
| `SPLICE_PLATFORM_APPROVER_EMAIL` | Inbox for new-club approval emails |
| `SPLICE_CLUB_APPROVAL_SECRET` | HMAC secret for signed approve/reject links (random string) |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key for transactional email |
| `RESEND_FROM_EMAIL` | Verified sender, e.g. `Splice <notify@splicesail.com>` |
| `SPLICE_UNDER_DEVELOPMENT` | Set to `1` to show an under-development page to **anonymous** visitors (health probes, club-approval email links, `/api/mobile/*`, login/signup, and **signed-in users** still work) |
| `SPLICE_UNDER_DEVELOPMENT_BYPASS` | Optional secret; open `/under-development?bypass=SECRET` once to set a 7-day bypass cookie for testing |

**Public club results** (`/results/[slug]`) use the anon key with RLS (`20261623120000_public_results_anon_rls.sql`). The club must have a **slug** set on `groups`.

Use `.env.local` for local development (not committed).

## Scripts

```bash
npm run dev          # Next dev
npm run dev:turbo    # Turbopack variant
npm run build
npm run start
npm run lint
npm run db:generate-rya-class-seed   # builds RYA class seed data (see scripts/)
```

## Database migrations

- Location: **`supabase/migrations/`**
- Filenames are timestamp-prefixed; **preserve ordering** for greenfield and production.
- After changing schema, regenerate types if your workflow uses them (add tooling if not present).
- **Never edit migrations already applied in production** — add a new timestamped file instead (see `AGENTS.md`).

Apply to a linked remote project with the Supabase CLI:

```bash
cd ~/Projects/splice
supabase db push
```

### Production migrations (Supabase)

Use this checklist when schema changes need to reach the live database (e.g. **RaceManager** on splicesail.com). **No Vercel redeploy** is required for SQL-only changes — only the database must be updated.

**Prerequisites**

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed (`supabase --version`)
- Repo checked out at `~/Projects/splice`
- Database password from **Dashboard → Project Settings → Database**

**Linked project**

| Field | Value |
|-------|--------|
| Name | RaceManager |
| Project ref | `vmkrdhxsxeexnipbpnjm` |

Link once (or re-link after cloning):

```bash
cd ~/Projects/splice
supabase link --project-ref vmkrdhxsxeexnipbpnjm
```

**Apply pending migrations (preferred)**

```bash
cd ~/Projects/splice
supabase db push
```

Review the listed SQL files, confirm when prompted. Each file under `supabase/migrations/` runs in timestamp order.

**Commit after applying**

Keep git in sync with production so the next `db push` does not drift:

```bash
git add supabase/migrations/<new-file>.sql
git commit -m "Describe why the schema changed"
git push
```

**Verify a constraint or column**

Dashboard → **SQL Editor**, or:

```bash
supabase db execute --linked 'select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = '\''public.race_fleets'\''::regclass and conname = '\''race_fleets_start_offset_minutes_check'\'';'
```

**Dashboard fallback (no CLI)**

1. Dashboard → project **RaceManager** → **SQL Editor → New query**
2. Paste the contents of the migration file from `supabase/migrations/`
3. **Run** — expect “Success. No rows returned” for DDL

If you apply SQL manually, record it so CLI history stays aligned:

```bash
supabase migration repair --status applied <migration_timestamp>
```

Example: `supabase migration repair --status applied 20261716120000`

#### Example: `race_fleets_start_offset_minutes_check`

RO fleet start signals call `apply_race_fleet_start_signal`, which recalculates `race_fleets.start_offset_minutes` from signal times. Pursuit or widely spaced fleets can exceed the original **0–60 minute** check, producing:

```text
new row for relation "race_fleets" violates check constraint "race_fleets_start_offset_minutes_check"
```

Until fixed, RO start updates fail and **`fleetStartUtc` does not update** for the phone app countdown.

| | |
|--|--|
| Migration file | `supabase/migrations/20261716120000_race_fleet_offset_max_240.sql` |
| Change | Widens check from **0–60** to **0–240** minutes |
| Apply | `supabase db push` |
| After apply | Retry RO start signal on web → refresh Race tab on phone → countdown should arm |

**Quick cheat sheet**

| Step | Action |
|------|--------|
| Go to repo | `cd ~/Projects/splice` |
| Apply | `supabase db push` |
| Project ref | `vmkrdhxsxeexnipbpnjm` |
| Password | Dashboard → Project Settings → Database |
| Commit | Add new `.sql` under `supabase/migrations/` and push to git |

## Project layout

```
src/app/(shell)/     Authenticated routes (home, groups, fleet, admin, RO)
src/app/results/     Public club results (outside shell)
src/app/actions/     Server actions
src/components/      UI components
src/lib/             Domain logic, Supabase helpers, scoring
src/proxy.ts         Next.js 16 proxy (session refresh, x-pathname)
supabase/migrations/ SQL migrations
docs/                Architecture and domain docs
AGENTS.md            Concise agent context (links here)
```

## Request pipeline

1. **`src/proxy.ts`** — Next.js 16 **proxy** file (successor to `middleware.ts`). Runs `getUser()` for session refresh on app routes; sets **`x-pathname`** header. Skips `/health`, `/api/health`, static assets.
2. **`src/app/(shell)/layout.tsx`** — shell, **`SiteNav`**, work-mode transition wrapper.
3. Server Components / actions use **`getServerAuth()`** for deduplicated auth.

## Debugging tips

| Concern | Where to look |
|---------|----------------|
| Work mode wrong | Cookie **`rm_work_mode`**; path inference in `src/lib/work-mode.ts`; **`x-pathname`** from proxy |
| Slow first page load | Proxy auth + cold compile; check terminal for compile vs runtime |
| RLS errors | Migration policies for the table; staff vs owner paths |
| Ad-hoc pending links | `link_status = pending_admin` on `race_guest_entries`; trigger `20261631120000_…` applied? |
| Public results empty | `groups.slug` set; anon policies applied |

## Production (`splicesail.com`)

Canonical origin: **`https://splicesail.com`** (see `src/lib/app-url.ts`). `www.splicesail.com` redirects to the apex domain.

After pointing DNS at your host (e.g. Vercel):

1. **`NEXT_PUBLIC_APP_URL`** — optional in production (defaults to `https://splicesail.com`); set explicitly if you use a preview/staging URL.
2. **Supabase Auth** — Dashboard → Authentication → URL configuration: add **`https://splicesail.com/**`** to redirect allow list; set site URL to `https://splicesail.com`.
3. **Strava** — API app callback domain: **`https://splicesail.com/api/strava/callback`**.
4. **Calendar feeds** — subscribe URLs are `https://splicesail.com/api/calendar/feeds/{token}` (no extra config).

## Documentation

See **`docs/README.md`** for the full doc index (architecture, data model, security, race types, onboarding).

## Next.js note

This project uses **Next.js 16** conventions (including **`proxy.ts`** instead of `middleware.ts`). See **`AGENTS.md`** and `node_modules/next/dist/docs/` before upgrading or changing framework APIs.
