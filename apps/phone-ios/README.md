# Splice Phone — iOS Compass via Connect IQ Mobile SDK

Native SwiftUI app that uses the phone’s motion sensors (landscape raw-yaw heading) and sends heading, heel, and trim to the Garmin **Sailing Performance** watch app through the **Connect IQ Mobile SDK** (Garmin Connect channel). This replaces the earlier custom BLE GATT peripheral approach, which conflicted with Garmin Connect Mobile’s own BLE link to the watch.

Architecture rules: [`../../docs/sailing-performance-rules.md`](../../docs/sailing-performance-rules.md)

## Features

- **Landscape compass** — heading from `attitude.yaw` only (`.xMagneticNorthZVertical`)
- **Connect IQ link** — `compass_sample` messages @ 4 Hz to watch; `start_timer` / `start_timer_ack` sync
- **Portrait** — setup (pair watch, zero heel/trim), **race tally** (Splice Sail sign-in), and analysis placeholder
- **Landscape** — countdown (when armed) or compass display

## Requirements

- Xcode 16+, iOS 17+
- Physical iPhone
- Garmin Connect app installed
- Sailing Performance watch app installed (`cb5e1003-a1b2-4c7a-b8f2-1a2b3c4d5e6f`)
- No Garmin portal registration needed for local testing — only Xcode `Info.plist` setup (URL scheme `splicephone-ciq`, `gcm-ciq` query scheme, display name)

## Setup

```bash
cd ~/Projects/splice/apps/phone-ios
xcodegen generate
open SplicePhone.xcodeproj
```

1. Set your **Development Team**
2. Build & run on iPhone
3. Setup → **Pair watch** → select device in Garmin Connect → return to Splice Phone

## Splice Sail (race tally)

### First-time secrets setup

`SpliceSecrets.plist` is **gitignored** and lives only on your machine. The app reads **only** this file — not `SpliceSecrets.example.plist`.

```bash
cd ~/Projects/compass-box/splice_phone_ios
# Only if SpliceSecrets.plist does NOT exist yet:
cp -n SplicePhone/Config/SpliceSecrets.example.plist SplicePhone/Config/SpliceSecrets.plist
```

Then edit **`SplicePhone/Config/SpliceSecrets.plist`** (in Xcode or a text editor):

| Key | Value |
|-----|--------|
| `SUPABASE_URL` | `https://vmkrdhxsxeexnipbpnjm.supabase.co` (RaceManager project) |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → **Project Settings → API** → **anon** / **publishable** key |
| `SPLICE_API_BASE_URL` | `https://splicesail.com` only — not an under-development or bypass URL |

Portrait **Race** tab → sign in → **Refresh**. Scroll to **API status** at the bottom to confirm the request succeeded.

### If `SpliceSecrets.plist` was overwritten

Common causes: copying `SpliceSecrets.example.plist` on top of the real file, or a merge/tool replacing it with placeholders.

1. Re-open `SplicePhone/Config/SpliceSecrets.plist` and restore the three keys above.
2. **Do not** commit this file — it stays local (see `.gitignore`).
3. Clean build in Xcode (⇧⌘K) and run again (⌘R).

`SpliceConfig` treats values containing `YOUR_` as unset, so placeholder example content will break sign-in until you fix the real plist.

## Message schema

| Direction | Event | Payload |
|-----------|-------|---------|
| Phone → watch | `compass_sample` | `heading`, `heel`, `trim`, `turn` (integers) |
| Watch → phone | `start_timer` | `timestamp` (unix seconds) |
| Phone → watch | `start_timer_ack` | (ack only) |

## Testing

1. Pair watch via Connect IQ device selection
2. Confirm Setup shows **Connected via Connect IQ**
3. Rotate to landscape — watch heading/heel/trim update
4. Regression: repeat with **Garmin Connect open and connected** to the same watch

## Related

| Path | Role |
|------|------|
| `garmin/sailing_performance/` | Watch app (receives phone messages) |
| `compass_test_ios/` | Raw-yaw heading validation |
