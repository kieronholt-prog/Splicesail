# Splice documentation

| Document | Purpose |
|----------|---------|
| [architecture.md](./architecture.md) | End-to-end design, routes, work modes, major subsystems, user flows |
| [data-model.md](./data-model.md) | Postgres tables grouped by domain; key FKs and columns |
| [security-and-rls.md](./security-and-rls.md) | Roles, RLS patterns, production secrets, operational cautions |
| [member-onboarding.md](./member-onboarding.md) | Joining clubs, adding members, series signup prerequisites |
| [race-types.md](./race-types.md) | Handicap vs level rated vs pursuit — generator, RO, tally |
| [development.md](./development.md) | Local setup, env vars, scripts, migrations, debugging |

## Where to start

| If you are… | Read first |
|-------------|------------|
| New to the codebase | **architecture** → **data-model** |
| Changing schema or RLS | **data-model** → **security-and-rls** |
| Working on RO / finishes / ad-hoc boats | **architecture** (Guest racing, RO workflow) → **race-types** |
| Working on scoring or standings | **race-types** → **architecture** (Scoring) |
| Onboarding or membership | **member-onboarding** |
| Local setup / migrations | **development** |

Agent context for Cursor also lives in [`AGENTS.md`](../AGENTS.md) at the repo root.
