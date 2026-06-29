# Data model summary

PostgreSQL schemas live under **`supabase/migrations/`**. This document groups tables by domain; for exact constraints and policies see the migration files (source of truth).

## Identity and profiles

| Table | Notes |
|--------|--------|
| `auth.users` | Supabase Auth; not in repo migrations |
| `profiles` | Display name, phone; **`share_track_for_enhanced_analytics`**, **`share_start_finish_times_for_results`** (privacy defaults); **`has_finished_account_intro`** for first-login redirect |

## Clubs (tenancy)

| Table | Notes |
|--------|--------|
| `groups` | Club; `created_by`, optional **`slug`**, **`iana_timezone`**, **`approval_status`** (`pending` / `approved` / `rejected`), RO-added boat settings |
| `group_memberships` | `(group_id, user_id)` PK, **`role`**: sailor / club_admin / race_officer |
| `group_join_requests` | Pending access; admin approve/decline on club page |

## Fleet templates (club level)

| Table | Notes |
|--------|--------|
| `group_fleets` | Named fleet group under a club |
| `group_fleet_classes` | Which `boat_classes.class_key` belong to each group fleet; **class_flag** for signalling |

## Hull catalogue and PY

| Table | Notes |
|--------|--------|
| `boat_classes` | Hull metadata; **`created_for_group_id`** for club-only hulls |
| `boat_class_pn` | Baseline PY per `class_key` (FK to `boat_classes`) |
| `group_class_py` | Club-level override per class |
| `series_class_py` | Series-level override per class |

## Sailor fleet

| Table | Notes |
|--------|--------|
| `boats` | **`owner_user_id`**; **`rya_class_key`**, **`py_rating`**, **`crew_template`**, label, **`default_sail_number`**, handedness; **`valid_from`** / **`valid_to`** soft retire (active fleet: `valid_to` in future) |

## Series and schedule

| Table / column | Notes |
|----------------|--------|
| `series` | Belongs to `group_id`; schedule template columns: **`schedule_generation_mode`** (`single_day` \| `date_range`), **`schedule_template_fleets`** (jsonb), **`start_sequence`**, **`minutes_between_races`**, **`default_race_type`**, **`pursuit_template_fleet_id`**, **`pursuit_template_finish_at`**, **`pursuit_template_start_increment_seconds`**, **`tally_open_hours_before_fleet_start`**, **`tally_close_hours_after_fleet_start`** |
| `races` | Belongs to `series_id`; **`scheduled_at`**, **`race_type`** (`handicap` \| `level_rated` \| `pursuit`), **`results_final`**, pursuit per-race: **`pursuit_group_fleet_id`**, **`pursuit_finish_at`**, **`pursuit_first_start_at`**, **`pursuit_start_increment_seconds`** |
| `calendar_event_tombstones` | **`uid`** (`{race_id}@splice`) + event window for **`STATUS:CANCELLED`** in series iCalendar feeds when a race is removed or a series is deleted; **`series_id`** nullable after series delete |
| `series_calendar_feeds` | Per-user **`token`** (UUID) for subscribed iCalendar URL; **`unique (user_id, series_id)`**; validated by **`series_calendar_feed_payload`** RPC (membership re-checked on each poll) |
| `race_fleets` | Per-race start lanes; **`start_offset_minutes`**, **`start_signal_at`** (RO-amended gun); **`filter_mode`**, signal flag |
| `race_pursuit_start_slots` | Pursuit class stagger rows per race |
| `race_pursuit_start_slot_classes` | Classes in each slot |
| `race_pursuit_py_overrides` | Optional per-race PY overrides for pursuit sheet |

## Registration and race participation

| Table | Notes |
|--------|--------|
| `series_registrations` | Member entered in a series (one per person per series) |
| `series_registration_boats` | Boats attached to signup — **(series_id, user_id, boat_id)**; INSERT triggers ad-hoc pending match (see Guest racing) |
| `race_entries` | Participation in one race; **`user_id`**, **`boat_id`**, tally times, **`outcome`**, **`py_override`**, crew overrides; **`started_marked_at`** = RO presence on start line |

## Scoring configuration

| Table | Notes |
|--------|--------|
| `series_scoring_config` | Handicap mode (e.g. portsmouth / none) |
| `series_penalty_rules` | DNS, DNF, DSQ, etc. point formulas |
| `series_discard_rules` | Discard bands by count of races with recorded scoring inputs |

## Finishes and race officer

| Table / subject | Notes |
|----------------|--------|
| `race_finishes` | RO / official finish instants; **`finish_position`** for level rated / pursuit; **`elapsed_seconds`**, **`corrected_seconds`**, **`effective_py`** computed in DB on save. Recomputed when race schedule or fleet start signals change. |
| `race_guest_finishes` | Guest / RO-added finishes; same timing columns as **`race_finishes`** |
| RO actions | `src/app/actions/ro-finishes.ts`, `ro-race-start.ts` |

## Guest racing

| Table | Notes |
|--------|--------|
| `club_guest_sailors` | **Legacy** scratch sailor; optional **`linked_user_id`** — no admin create UI today |
| `boats` (guest holder) | Legacy guest hull rows via **`club_guest_sailor_id`**; optional **`linked_boat_id`** |
| `race_guest_entries` | One row per scratch/RO competitor per race. **Ad-hoc:** `boat_id` null, **`adhoc_sail_number`**, **`adhoc_rya_class_key`**. **Legacy:** `boat_id` → guest holder boat. **`link_status`**: `unlinked` \| `pending_admin` \| `confirmed`. **`linked_race_entry_id`**, **`pending_matched_user_id`**, **`pending_matched_boat_id`**. Migrations: **`20261320120000_…`**, **`20261631120000_…`**. |
| `race_guest_finishes` | Finish times for guest rows |

**Pending admin match:** after **`INSERT`** on **`series_registration_boats`**, trigger calls **`mark_pending_adhoc_links_for_series_boat`** (SECURITY DEFINER) when sail + class match an ad-hoc row with a finish in the same series.

See [race-types.md](./race-types.md) for handicap vs level rated vs pursuit behaviour.

## GPS track analysis (Sailstats)

| Table | Notes |
|--------|--------|
| `group_sailing_marks` | Per-club chart marks; `mark_kind`: `fixed` \| `laid` \| `start_finish` \| `start_line` \| `finish_line`; line marks require `lat2`/`lon2` |
| `group_sailing_courses` | Course letter; `mark_sequence` jsonb (ordered mark names, position 0 is always the S/F mark); `marks_preamble` jsonb (marks rounded once on opening lap only, placed after the start in display order); `cross_sf_each_lap` boolean (default false) |
| `user_strava_connections` | Strava OAuth tokens per user |
| `race_track_submissions` | Track ingest, race/boat link, `analysis_mode`, status machine |
| `race_fleet_analysis_settings` | RO-confirmed course, laps, and mark positions per `race_fleets` row (collated analysis) |
| `race_analysis_settings` | **Deprecated** — migrated to `race_fleet_analysis_settings`; retained for rollback |
| `race_track_analyses` | Computed stats + optional `analysis_snapshot` |

Storage bucket **`race-tracks`** for uploaded GPX/FIT. See [sailing-analysis.md](./sailing-analysis.md).

**WSC seed:** migration `20261703120000_seed_wsc_sailing_area.sql` defines `seed_wsc_sailing_area(group_id)` and auto-seeds clubs whose slug is `warsash` / `wsc` / `warsash-sc` or whose name contains “Warsash”. Club admins can re-run via **Sailing area → Import WSC** (idempotent — skips if marks already exist).

**WSC courses:** 23 courses (A–Y) were hard-reset to match the canonical Course Selector app (`20261713120000_reset_wsc_courses_canonical.sql`). `mark_sequence[0]` is always `START/FINISH`; preamble marks are displayed immediately after the start mark.

### Sailing area admin UI (`/groups/[id]/club-admin/sailing-area`)

Single Mapbox instance across the whole page (one credit per load). Two main sections:

**Marks** — collapsible groups: Start/Finish line marks (blue), Pile/Buoy (colour by channel side), Named Fixed (yellow), Laid (orange). Inline edit modal per mark. Mark kinds:
- `start_finish` / `start_line` / `finish_line` — two-ended line marks (lat/lon + lat2/lon2); shown in blue; rendered as A/B endpoints + centre marker
- `fixed` — permanent chart feature; colour by `channel_side` (green/red) or yellow if none
- `laid` — temporary race mark; orange

**Courses** — pill selector switches the map between All-marks overview and a per-course route view:
- All-marks view: colour-coded markers with legend and navigation disclaimer
- Course view: S/F line + numbered markers coloured by rounding side (port=red, starboard=green); route line from S/F centre through all sequence marks closing back to first sequence mark (or wrapping via `cross_sf_each_lap`); first-lap-only (preamble) marks shown lowercase
- `CourseDetailPanel` warns if first mark is not a start line or last mark is not a finish line
- Add Mark dropdown includes all marks including duplicates and line marks (several WSC courses legitimately use the same mark twice)
- Preamble marks display order: `[seq[0], ...preamble, ...seq[1:]]` — i.e. START/FINISH → preamble marks → rest of sequence

**Key components:**
- `src/components/sailing-area-view.tsx` — top-level, owns the single Mapbox instance; GeoJSON sources created once on map load and updated via `setData()` (avoids stale-source race condition)
- `src/components/sailing-area-marks-section.tsx` — collapsible mark groups + edit modal
- `src/components/sailing-area-courses-section.tsx` — course pills + `CourseDetailPanel`
- `src/components/sailing-analysis/mark-edit-map.tsx` — mini map used inside mark edit modal

## Naming gotchas

- **`groups`** is the club table (SQL keyword; qualified in policies).
- Column is **`iana_timezone`**, not `iana_time_zone`.
- **`rya_class_key`** on boats = catalogue class key (after `rya_class_py` → `boat_classes` rename).
- **`schedule_template_fleets`** is a **jsonb column** on **`series`**, not a separate table.
- **`race_entries`** uniqueness is per **(race_id, user_id)** with optional multi-hull via distinct boat rows across races (see `20260527120000_…`).
