# Splice mobile apps

On-water software for sailors: phone instrument + Garmin watch companion. Club racing (tally, results, track analysis) is served by the **web app** at the repo root (`src/`).

| App | Path | Role |
|-----|------|------|
| **Splice Phone** (iOS) | [phone-ios/](phone-ios/) | Landscape compass, heel, trim, SOG, VMG/wind engine; portrait setup + **race tally**; Connect IQ link to watch |
| **Splice Watch** (Garmin CIQ) | [watch-garmin/](watch-garmin/) | Countdown, mirrored displays, GPS/FIT recording; receives compass samples from the phone |

## Architecture rules

Shared product rules for phone, watch, and future Android: [`docs/sailing-performance-rules.md`](../docs/sailing-performance-rules.md).

## Setup

- **Phone:** see [phone-ios/README.md](phone-ios/README.md) — Xcode, `SpliceSecrets.plist`, Supabase + `/api/mobile/*`
- **Watch:** see [watch-garmin/README.md](watch-garmin/README.md) — Connect IQ SDK, sideload `.prg`

## Legacy CompassBox

Standalone nRF BLE compass firmware, Expo BLE app, and old Garmin data field live under [`legacy/compass-box/`](../legacy/compass-box/). The active Splice stack uses **phone motion + CIQ Mobile SDK**, not CompassBox GATT.
