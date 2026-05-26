# Security and RLS

## Threat model (practical)

- **Authenticated sailors** must only see and change data for clubs they belong to and their own boats/entries unless a feature explicitly expands scope (e.g. RO recording finishes, reading hulls on series signups for start line).
- **Club admins** can manage club configuration, members, join requests, hull/PY, schedules, and **pending RO-added result linking**.
- **Race officers** can operate races and finishes for assigned clubs—many policies allow `club_admin` **or** `race_officer`.
- **Never expose service-role keys** to the browser or client bundles.

## Roles

Stored in **`group_memberships.role`**:

| Role | Typical capabilities |
|------|---------------------|
| `sailor` | Own boats, enter series/races allowed by UI + RLS, read club-visible data, self-declare tally outcomes |
| `race_officer` | Race fleets, signals, finishes, ad-hoc boats (per migrations + actions) |
| `club_admin` | Above + memberships, join approval, schedules, fleets, hull/PY overrides, **adhoc link confirm/dismiss UI** |

**Work mode note:** users with **`club_admin`** also unlock **Race officer** work mode in the header (any staff membership qualifies for RO mode). See [architecture.md](./architecture.md).

**Server actions** re-check role before redirects; **RLS** must still allow or deny the underlying SQL for defense in depth.

## RLS building blocks

- **`is_group_member(gid uuid)`** — `SECURITY DEFINER`, returns whether `auth.uid()` has any membership in that group.
- **`is_group_admin(gid uuid)`** — same pattern for `club_admin` role.

Granted to **`authenticated`**, revoked from **`public`**, to avoid self-referential RLS recursion.

## Patterns seen in migrations

- **Member read, admin write** for `series`, `series_scoring_config`, penalty/discards, etc.
- **Staff write** (`club_admin` ∪ `race_officer`) for **`race_fleets`**, **`race_guest_entries`**, RO-related mutations.
- **Owner-only** policies on **`boats`** for sailor CRUD—plus **SELECT** policies so group members can read hulls on **`race_entries`** or **`series_registration_boats`** (RO start line / finishes). **`enforce_race_entry_boat_owner`** is **SECURITY DEFINER** for staff inserts (`20261620120000_…`). **`boat_referenced_by_group_series_registration`** / **`boat_owned_by`** break **`boats` ↔ `series_registration_boats`** recursion (`20261628120000_…`).
- **`boat_class_pn`**: club admins manage PN for **`boat_classes.created_for_group_id`**; national rows typically not club-editable. **INSERT** grant: `20261314120001_boat_class_pn_insert_rls.sql`.
- **RO ad-hoc linking:** **`mark_pending_adhoc_links_for_series_boat`** runs as **SECURITY DEFINER** on series signup insert; requires **`auth.uid()`** = signing-up sailor. **`confirm_race_guest_entry_link`** allows **`club_admin`** or **`race_officer`**; the **pending queue UI** (`confirmPendingAdhocLinkAction`) is **club_admin only**. **`delink_race_entry_to_ro_added`** is **club_admin only** (de-link tool UI).

Always read the migration for the table you are changing.

## Application secrets

| Variable | Exposure | Purpose |
|-----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Anon key for user-scoped PostgREST with RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Not used by the app today; migrations / break-glass only. Never `NEXT_PUBLIC_`. |

## Public results (`/results/[slug]`)

- Uses the **anon** key server-side (`createPublicResultsClient`) with **RLS**, not the service role.
- Visible only when the club has a non-empty **`groups.slug`** (`20261623120000_public_results_anon_rls.sql`, boats RLS fix `20261624120000_…`).
- Exposes race/series results and display names needed for standings—do not set a slug on clubs that should stay private.

If you introduce **service role** usage: server-only, audit admin operations, least privilege.

## Cookies and SSR

- **`src/lib/supabase/server.ts`**: `createServerClient` with cookie adapters; `setAll` try/catch for Server Component paths that cannot mutate cookies.
- **`src/proxy.ts`**: Next.js 16 **proxy** (replaces `middleware.ts`) refreshes session on matched routes; sets **`x-pathname`** for work-mode nav. Excludes `/health` and static assets.
- **`rm_work_mode`**: work mode cookie (see [development.md](./development.md)).

## Operational checklist (production)

1. Enable RLS on new tables by default; grant `authenticated` / `service_role` explicitly.
2. Test **club admin** and **race officer** flows with a non-admin account.
3. Review **guest / ad-hoc** policies when exposing scratch data.
4. Keep migration order linear; never edit applied production migrations—add a new file.

## Related

- [member-onboarding.md](./member-onboarding.md)
- [architecture.md](./architecture.md)
