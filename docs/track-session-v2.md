# Track & session V2

Phone session recording, watch FIT → Garmin Connect, GPS merge (FIT / Strava / upload), RO-synced countdown, and standalone watch operation.

Builds on V1: tally afloat, `OnWaterSession` metadata, `/api/mobile/next-race` and `/api/mobile/tally`.

See also: [sailing-performance-rules.md](./sailing-performance-rules.md), [sailing-analysis.md](./sailing-analysis.md), [apps/phone-ios/README.md](../apps/phone-ios/README.md).

## Goals

| Goal | Detail |
|------|--------|
| Rich analysis | High-rate heading/heel/trim (+ wind) on phone; GPS from best source |
| Race link | Tally afloat → `race_entry_id`; auto-upload when ready |
| No duplicates | One primary submission per race entry; Splice beats Strava |
| Garmin ecosystem | Watch saves sailing FIT to Garmin Connect always |
| RO alignment | Optional club countdown when phone linked |
| Watch autonomy | Manual countdown + FIT without phone |
| Fallback | Strava or manual FIT on web when no phone merge |

## Non-goals (V2)

- Live shore tracking (web relay)
- Android phone app
- Server analysis using attitude channels (store in V2; engine later)
- Real-time RO push (polling OK)

## Countdown modes

| Mode | Trigger | Gun time |
|------|---------|----------|
| `standalone_manual` | Sailor on watch only | Watch `Time.now() + preset` at arm |
| `club_synced` | Phone linked, tallied, fleet start from API | `fleetStartUtc` from Splice |
| `phone_manual` | Sailor arms from phone | Phone preset → `countdown_sync` |

**Watch manual arm always allowed.** Phone cannot force override `standalone_manual`; may offer *“Sync to club start?”* for sailor to accept on watch.

## Polling (Race tab)

- **Window:** ±10 minutes around each boat’s `fleetStartUtc`
- **Inside window:** poll `GET /api/mobile/next-race` every **10 s** while Race tab visible and app foreground
- **Outside window:** pull-to-refresh / ~60 s optional
- On `fleetStartUtc` change and `club_synced`: re-send `countdown_sync` to watch

## Time model

| Field | Source | Use |
|-------|--------|-----|
| `race_start_utc` | `race_fleets.start_signal_at` ?? `scheduled_at + offset` | Analysis, scoring |
| GPS timestamps | FIT / Strava / upload records | Position track, attitude alignment |
| `device_gun_utc` | Watch `start_timer` at countdown zero | UI, diagnostics |

**Start alignment warning:** flag when `|device_gun_utc − race_start_utc| > 15s`. Analysis still uses `race_start_utc`. Not a block.

## Sensor recording (Mode A)

- **Phone:** 10–20 Hz attitude JSON sidecar (+ wind ~1 Hz)
- **Watch FIT:** native GPS → Garmin Connect; no dev-field heading/heel when phone-linked
- **Standalone watch:** FIT GPS only

## Auto-arm FIT

Only when: race **tallied afloat**, **watch or phone app open**, within short pre-start window (2–5 min). Otherwise manual arm.

## Post-race (phone connected)

On `activity_ended` from watch:

| Action | Behaviour |
|--------|-----------|
| **Save (Tally later)** | End session, merge later, no ashore tally |
| **Save and Tally Ashore** | Declaration: Finished / Retired / DNS / DNC |

## Manual start without tally

If manual countdown and today’s race within ~±30 min but no tally afloat: prompt *“Tally for this race?”* (phone-first; watch queues intent if needed).

## GPS merge priority

1. Watch FIT on phone  
2. Existing Splice submission (Strava/upload cache) for `race_entry_id`  
3. Phone GPS  
4. Defer / manual upload  

**Dedup:** one canonical `race_track_submissions` row per `(user_id, race_entry_id)`; `track_source: splice` wins over Strava.

## Attitude transport

**JSON sidecar** (gzip optional later), not embedded in FIT:

```json
{
  "sessionId": "uuid",
  "raceEntryId": "uuid",
  "samples": [{ "t": 1719494700.12, "hdg": 273, "heel": 5, "trim": -2, "turn": 0.3, "wind": 185 }],
  "events": [{ "t": 1719494700, "type": "device_gun" }]
}
```

GPS remains separate `{ lat, lon, time }[]`.

## Implementation phases

| Phase | Status | Deliverable |
|-------|--------|-------------|
| **V2.0a** | In progress | `fleetStartUtc` API, Race tab polling, club countdown sync, attitude JSON log, session V2 fields, activity-end sheet |
| **V2.0b** | Planned | Watch SyncDelegate → phone, FIT parse, merge gate v1 |
| **V2.0c** | Planned | `POST /api/mobile/session-upload`, Strava dedup, `track_source: splice` |
| **V2.1** | Planned | Strava GPS fallback API, merge quality UI |
| **V2.2** | Planned | Attitude in analysis engine |

## API additions (V2.0a)

Per boat on `GET /api/mobile/next-race`:

```json
{
  "fleetStartUtc": "2026-06-27T13:05:00.000Z",
  "fleetStartSource": "start_signal_at"
}
```

`fleetStartSource`: `start_signal_at` | `scheduled_offset`.
