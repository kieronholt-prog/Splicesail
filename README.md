# Splice

**Your race. Your club. Spliced.**

Club dinghy racing for sailors, club admins, and race officers — series, fleets, Portsmouth Yardstick scoring, race-day tools, GPS track analysis, plus **Splice Phone** (iOS) and **Splice Watch** (Garmin).

## Getting started

### Web (club racing, tally, analysis)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

See [`docs/`](./docs/README.md) for architecture, data model, RLS, and local development.

### Mobile apps

| App | Path |
|-----|------|
| iOS phone (compass, race tally) | [`apps/phone-ios/`](./apps/phone-ios/) |
| Garmin watch | [`apps/watch-garmin/`](./apps/watch-garmin/) |

Overview: [`apps/README.md`](./apps/README.md). Shared rules: [`docs/sailing-performance-rules.md`](./docs/sailing-performance-rules.md).

## Stack

- **Web:** Next.js (App Router), React, TypeScript, Tailwind CSS v4, Supabase (Postgres + Auth)
- **Phone:** SwiftUI, Supabase Auth, Connect IQ Mobile SDK
- **Watch:** Garmin Connect IQ (Monkey C), FIT `SPORT_SAILING`
