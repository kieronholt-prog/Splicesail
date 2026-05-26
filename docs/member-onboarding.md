# Member onboarding

## End-to-end path (as implemented)

Typical new sailor journey:

1. **Sign up** — Supabase Auth (`/signup`).
2. **My boats** — create hulls on `/fleet` (`boats` owned by `owner_user_id`).
3. **Join a club** — search on `/groups`, open club page, **request to join**; admin approves on `/groups/[id]` (admin work mode) or admin adds member by UUID.
4. **Series entry** — `/groups/[id]/series-entries`: select series and attach fleet boat(s) (`series_registrations` + `series_registration_boats`).
5. **Race day** — home tally (afloat/ashore), RO records start line presence and finishes.

There is **no** in-app flow that creates `auth.users` via Admin API (no `SUPABASE_SERVICE_ROLE_KEY` usage in the app today).

## Joining a club

### Self-serve (primary)

- Sailor finds club on **`/groups`** (search by name or slug).
- On **`/groups/[id]`**, non-members submit **`requestJoinClubAction`** → row in **`group_join_requests`** (`status = pending`).
- **Club admins** (admin work mode) see **Pending join requests** at the top of the club page; **Approve** / **Decline** via `group-join-requests` actions.
- Approved users get **`group_memberships`** with role **`sailor`**.
- **Nav badge** (red dot on My Entries / Clubs) alerts admins to pending join requests and pending ad-hoc link reviews.

### Admin add by UUID (still supported)

- **Club admins** use **Members** on `/groups/[id]/club-admin` with the user's **`auth.users` id (UUID)**.
- Server action: **`addGroupMemberByUserIdAction`** in `src/app/actions/group-members.ts`.
- **Promote to club admin**: **`promoteToClubAdminAction`**.
- **Race officer role**: assigned via same member tools (UUID path).

The onboarding sailor must **already exist** in Auth before an admin can attach them.

## Creating a club

- **`/groups/new`** — **`createGroupAction`**; creator becomes **`club_admin`** via DB trigger on `groups`.

## Series signup (after membership)

- Separate from club join: member opens **`/groups/[id]/series-entries`**.
- Must select at least one **fleet boat** per series; boats cannot be invented at signup time.
- If an RO previously recorded an ad-hoc result for matching sail + class, admins get a **pending link** queue on club admin (see [architecture.md](./architecture.md) § Guest racing).

## Implications

- Brand-new sailors must **sign up themselves** (or be created in Supabase Dashboard / external Admin API) before club attachment.
- RLS ensures only admins can attach UUIDs to their club—but admins still **verify identity out of band**.
- **`/enter-series`** redirects to **`/groups`**; the series-entry UI lives under each club's **series-entries** page.

## Future enhancement (not implemented)

Past discussions contemplated **server-side account creation** (Admin API + invite emails) so club admins do not manage raw UUIDs. If implemented:

1. Add **`SUPABASE_SERVICE_ROLE_KEY`** only on server runtime.
2. Guard with **`club_admin`** verification and audit logging.
3. Update this doc and **`docs/security-and-rls.md`**.

Roadmap ideas beyond current GPS track analysis (Garmin Connect, email notifications, etc.) are listed in [sailing-analysis.md](./sailing-analysis.md).

## Related

- [security-and-rls.md](./security-and-rls.md)
- [data-model.md](./data-model.md) — `group_memberships`, `group_join_requests`
- [architecture.md](./architecture.md) — routes and work modes
