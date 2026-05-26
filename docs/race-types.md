# Race types (Handicap, Level rated, Pursuit)

Series and races store **`race_type`**: `handicap` | `level_rated` | `pursuit`. Default for new series: **`series.default_race_type`**.

## Generator

**Race type** is the first choice on the **Race / series generator** — it controls which fields appear:

| Type | Generator fields |
|------|-------------------|
| **Handicap** / **Level rated** | Schedule, first start time, **start sequence**, **applicable fleets** (multi-select) |
| **Pursuit** | Schedule, **first boat start**, **finish time**, **pursuit start interval**, **pursuit fleet** (single dropdown) — no start sequence or applicable fleet list. **Time between races** applies when more than one pursuit is scheduled on the same day. |

**Pursuit template** (on **`series`**, copied when races are created):

| Column | Purpose |
|--------|---------|
| `pursuit_template_fleet_id` | Club fleet whose classes define the pursuit sheet |
| `pursuit_template_finish_at` | Template finish instant (combined with each race day) |
| `pursuit_template_start_increment_seconds` | 30 / 60 / 120 s grid |

**Per-race pursuit columns** (on **`races`**, editable under Maintain series → Races):

- `pursuit_group_fleet_id`, `pursuit_finish_at`, `pursuit_first_start_at`, `pursuit_start_increment_seconds`
- Slot rows: **`race_pursuit_start_slots`**, **`race_pursuit_start_slot_classes`**
- Optional: **`race_pursuit_py_overrides`**

## Scoring and starts

| Type | Scoring | Starts |
|------|---------|--------|
| **Handicap** | Portsmouth corrected time (`corrected_seconds` in DB) | Per **`race_fleets`** offset / **`start_signal_at`** |
| **Level rated** | Finish **position** per fleet (`race_finishes.finish_position`) | Per fleet |
| **Pursuit** | Finish position (line order) | Class stagger sheet from PY |

Series standings include races once they have **recorded scoring inputs** (provisional or final), independent of **`results_final`**.

When **`races.results_final`** is true, RO cannot add new ad-hoc boats on manage/finishes.

## Pursuit admin (maintain series)

Club admin sets on each pursuit race under **Maintain series → Races**:

- Finish time, first boat start, start increment (30 s / 1 min / 2 min)
- Fleet (class set from `group_fleet_classes`)
- Save recalculates **`race_pursuit_start_slots`**: slowest class starts at **first boat start** and races until **finish time**; faster classes start later by PY ratio, snapped to the increment grid.

## Sailor tally (pursuit)

- Tally pad header shows **class start time** from the pursuit sheet.
- **Tally List** (pursuit): slots with sail numbers / `—`; green tick in header **only on the sailor's slot when tallied afloat**. Only boats with a **`race_entry`** and on series signup.

## Race officer

### Start line (`…/races/[raceId]/manage`)

- **Handicap / level rated:** per-fleet presence badges; single tap seen, double tap OCS, tap again clear.
- **Pursuit:** rolling slot list with boat badges; filters hide empty slots.
- **Fleet start signals:** `RoFleetStartSignalsPanel` / `ro-race-start.ts` — amend gun times; DB recomputes finish elapsed/corrected columns.
- **Ad-hoc add:** sail + class when race not **`results_final`**.
- Lists **all series-registered hulls**, including not yet tallied afloat.

### Finishes (`…/races/[raceId]/finishes`)

- **Handicap:** RO finish time; corrected/elapsed stored by DB triggers.
- **Level rated / pursuit:** next **`finish_position`** in fleet.
- **RO-only outcomes:** `ocs`, `dnf`, `dsq` (sailors use `finished`, `retired`, `dns`, `dnc` on tally — see `src/lib/finish-outcome-labels.ts`).

## Start line (all types)

Single tap: unseen → seen. Double tap (unseen): OCS. Single tap (seen or OCS): back to unseen.

## Related

- [architecture.md](./architecture.md) — RO workflow, scoring overview
- [data-model.md](./data-model.md) — pursuit tables and series columns
