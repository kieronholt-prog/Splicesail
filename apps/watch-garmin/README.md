# Splice Watch — Garmin Connect IQ

Garmin **watch-app** (branded Splice in UI): race countdown, phone compass via Connect IQ Mobile SDK, and `SPORT_SAILING` FIT recording.

Rules: [`../../docs/sailing-performance-rules.md`](../../docs/sailing-performance-rules.md)

## Screens (swipe left/right)

| # | View | Content |
|---|------|---------|
| 1 | Countdown | User-configurable pre-start timer; tap to arm / fire gun |
| 2 | Heading / Heel | Raw phone compass heading and heel |
| 3 | Trim / Turn | Raw phone compass trim and turn rate |

Compass data arrives from the **Splice Phone** iOS app via `Communications.registerForPhoneAppMessages` (no custom BLE GATT).

## FIT recording

- `ActivityRecording.createSession({ :sport => Activity.SPORT_SAILING })`
- Developer fields via `session.createField()` (same IDs as `compass_datafield`):
  - 0 Heading, 1 Heel, 2 Trim, 3 Turn rate
- Native Garmin sailing metrics (GPS, speed, distance) recorded automatically by the session
- `session.save()` on back / session end → syncs to Garmin Connect

## Phone sync (Connect IQ Mobile SDK)

Phone → watch (`compass_sample` @ 4 Hz):

```json
{ "event": "compass_sample", "heading": 273, "heel": 5, "trim": -2, "turn": 0 }
```

Watch → phone on start gun:

```json
{ "event": "start_timer", "timestamp": <unixSeconds> }
```

Phone → watch ack:

```json
{ "event": "start_timer_ack" }
```

See `PhoneComms.mc` and [`../phone-ios/`](../phone-ios/).

## Install on your watch

### Option A — USB sideload (fastest)

1. Quit **Garmin Express** (menu bar too).
2. Connect the watch via USB.
3. Install [OpenMTP](https://openmtp.ganeshrvel.com/) if needed: `brew install --cask openmtp`
4. Open OpenMTP → **GARMIN** → **APPS**
5. Drag `bin/SailingPerformance.prg` into APPS
6. Disconnect safely; reboot the watch if the app does not appear
7. On watch: app list → **Sailing Performance**

Or run (auto-copies if the watch volume is mounted):

```bash
./scripts/install-device.sh epix2pro47mm   # Quatix 7 Pro; fenix7pro, fenix7x, … for other models
```

### Option B — Beta via Garmin Connect (no USB file access)

```bash
./scripts/package-iq.sh
```

Upload `bin/SailingPerformance.iq` at [Garmin Submit an App](https://developer.garmin.com/connect-iq/submit-an-app/) as a **Beta App**, then install from **Garmin Connect** on your phone.

## Build only

```bash
./scripts/build.sh epix2pro47mm   # Quatix 7 Pro (default)
# Output: bin/SailingPerformance-v0.5.1-epix2pro47mm.prg
# Also:   bin/SailingPerformance.prg (copy of latest build)
#         bin/BUILD_INFO.txt

./scripts/prg-info.sh   # show version embedded in a .prg
```

Install (device connected via Garmin Express / USB):

```bash
./scripts/install-device.sh   # add when ready — copy from compass_ble_test
```

Simulator:

```bash
connectiq   # then load bin/SailingPerformance.prg
```

## App ID

`cb5e1003a1b24c7ab8f21a2b3c4d5e6f` — register this UUID in Garmin developer portal for CIQ Mobile SDK pairing with the iOS app.

## v0.1 limitations

- Session sync to phone post-race (`Communications.SyncDelegate`) not yet implemented
- Mode 1 live position relay to Splice web server not yet implemented
