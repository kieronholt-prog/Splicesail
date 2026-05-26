# Splice — agent context

Concise facts for anyone (human or agent) working on this repo. Deep detail lives under `docs/`.

## Product

Club dinghy racing **Splice**: multi-tenant **clubs** (`groups`), **members** with roles, **series** and **races**, **race entries** and **finishes**, **Portsmouth Yardstick** scoring, **race-only RO-added** boats (adhoc guest rows), optional **legacy guest** data. Primary users: sailors, club admins, race officers. Three **work modes** (sailor / admin / race officer) change nav and home URLs.

## Stack

- **Next.js 16** (App Router under `src/app`), **React**, **TypeScript**, **Tailwind CSS v4**.
- **Supabase**: Postgres + Auth; **`@supabase/ssr`** cookie-backed server clients (`src/lib/supabase/server.ts`). **`getServerAuth()`** (`src/lib/supabase/auth-cache.ts`) deduplicates auth per request (React `cache()`).
- **`src/proxy.ts`**: Next.js 16 **proxy** (replaces `middleware.ts`) — session refresh + **`x-pathname`** header for work-mode nav. Excludes health/static routes.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Architectural anchors

| Topic | Where |
|--------|--------|
| Full architecture & routes | [`docs/architecture.md`](docs/architecture.md) |
| Tables & relationships | [`docs/data-model.md`](docs/data-model.md) |
| RLS, roles, secrets | [`docs/security-and-rls.md`](docs/security-and-rls.md) |
| Joining clubs & members | [`docs/member-onboarding.md`](docs/member-onboarding.md) |
| Handicap / level rated / pursuit | [`docs/race-types.md`](docs/race-types.md) |
| Env & tooling | [`docs/development.md`](docs/development.md) |

## Domain rules (don’t contradict these)

1. **Tenancy**: A **group** is a club; `group_memberships` gives each user a **role**: `sailor` \| `club_admin` \| `race_officer`. RLS uses **`is_group_member`** / **`is_group_admin`** (security definer). **Join requests** gate self-serve membership; admins get **nav badges** for pending joins and pending ad-hoc links.
2. **Series signup = sailor + boat**: **`series_registration_boats`** links fleet hulls to a series; tally on home is only for boats on that signup. Entry UI: **`/groups/[id]/series-entries`** (`enterSeriesBulkAction`).
3. **Hull catalogue**: `boat_classes` (RYA seed + club hulls via `created_for_group_id`). Baseline PN in **`boat_class_pn`**; effective PN order **`series_class_py` → `group_class_py` → `boat_class_pn` → `boats.py_rating`** (`src/lib/resolve-class-py.ts`). Club PN INSERT: `20261314120001_…`.
4. **Club fleets vs race fleets**: **`group_fleets`** = club templates; **`race_fleets`** = per-race start lanes (class keys or PY band, offset, signals, optional **`start_signal_at`**).
5. **Time**: Clubs store **`iana_timezone`** on `groups` (note spelling); wall-clock via `src/lib/club-zoned.ts`, `src/lib/club-display-format.ts`. Stored instants are UTC.
6. **RO-added (adhoc) boats**: **`race_guest_entries`** with sail + class, no signup. **`link_status`**: unlinked → pending_admin (on series boat insert match) → confirmed via admin queue + **`confirm_race_guest_entry_link`**. Legacy **`club_guest_sailors`** / guest boats: DB/scoring only, no admin create UI. Settings: **`groups.ro_added_boats_series_start_line`**, **`ro_added_boats_series_standings`**.
7. **Finish outcomes**: Sailors — `finished`, `retired`, `dns`, `dnc`. RO/admin only — `ocs`, `dnf`, `dsq` (`src/lib/finish-outcome-labels.ts`).
8. **Work modes**: Cookie **`rm_work_mode`**; **`club_admin`** unlocks admin mode; **any staff membership** unlocks RO mode (`src/lib/work-mode.ts`).

## Where code usually goes

- **Pages / layouts**: `src/app/(shell)/…` (authenticated), `src/app/results/` (public)
- **Server actions**: `src/app/actions/*.ts` — role checks here; RLS as backstop
- **Shared domain logic**: `src/lib/` (scoring under `src/lib/scoring/`, ad-hoc links under `src/lib/adhoc-link-pending.ts`)
- **Work mode**: `src/lib/work-mode*.ts`, `src/components/work-mode-*.tsx`, `src/components/site-nav.tsx`
- **RO**: `ro-finishes.ts`, `ro-race-start.ts`, `ro-race-presence-buttons.tsx`, `ro-finish-badges.tsx`
- **Schema**: `supabase/migrations/*.sql` — ordered; don’t renumber applied migrations

## When you change behavior

Update **`docs/`** when you alter tenancy, auth, PN resolution, guest/ad-hoc racing, work modes, public results, or RLS—so the next session does not rely on chat history.
