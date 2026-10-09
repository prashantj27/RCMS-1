# RCMS – notes for AI coding agents

Read `README.md` and `docs/ARCHITECTURE.md` first. This is **Next.js 16** (see `AGENTS.md`): `params`/`searchParams`/`cookies()` are async,
there is no `middleware.ts`, and `next lint` is gone (use `npm run lint`).

## Commands

- Verify everything: `npm run check` (format, lint, types, tests). E2E: `npm run build && npm run test:e2e` (set `CHROMIUM_PATH` if browsers are pre-installed).
- Schema change → edit `src/server/db/schema.ts` → `npm run db:generate` → commit the SQL (CI fails on drift). Keep migrations additive.
- Zero-setup DB: unset `DATABASE_URL` → embedded PGlite in `.data/`. Real Postgres: `TEST_DATABASE_URL=… npx vitest run` (**wipes** that DB).

## Access (no login module)

- There is **no authentication**: `/` is the portal chooser, `/enter/<admin|hq|centre|analyst>` sets a persona cookie, `/choose-centre` picks the centre for the centre portal. Personas are built in `src/server/auth/prototype.ts` from the real role capabilities (minus `users:manage`; DOB/parents only with `RCMS_PROTOTYPE_SHOW_PII=1`). Do not re-introduce login, sessions or user tables.
- Never weaken the capability/scope checks because "it's a prototype" – the portals are only as safe as those checks.
- Work happens on the **`dev`** branch (Vercel Production Branch). The national workbook is imported from the Administrator portal (browser sends the raw file in pieces → `/api/imports/stage*` → `import_stage_chunks` → server parses → `runAthleteImport`; "replace" empties the registry in the same transaction) or `npm run import:athletes`.

## Rules

- Business rules live in `src/domain` (pure, no I/O) and are unit-tested. SQL lives only in `src/server/services` / `src/server/import`.
- Every new query must apply the caller's scope via `services/filters.ts`; every endpoint declares a capability in `route({ cap })`.
- **Never commit real athlete data** (xlsx/csv are ignored) and never log or return `mobile_cipher`, DOB or parents' names outside the PII-gated paths.
- Invalid source values are _not stored_ – they become a data-quality finding. Imports are upsert-only and idempotent unless the Administrator explicitly ticks "Replace all existing data" (one transaction, rolls back on failure); keep it that way.
- Add tests with the change: unit for `domain`, integration (`tests/integration`) for services, Playwright for user journeys.
- Don't use `pkill -f`/`pgrep -f` patterns that match your own shell; stop dev servers with `fuser -k <port>/tcp`.
