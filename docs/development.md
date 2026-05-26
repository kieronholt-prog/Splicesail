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
| `SPLICE_UNDER_DEVELOPMENT` | Set to `1` to show an under-development page on all routes (except health probes and club-approval email links) |
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

Apply locally with your usual Supabase CLI workflow (e.g. `supabase db push`).

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
