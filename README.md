# RCMS – Regional Centre Monitoring System

Athlete registry, data-quality control and kit & shoe planning for Khelo India / SAI centres.
Built from the national athlete master workbook (`RC_monitoring_Athlete_Details_V1.xlsx`: 65,508 rows →
**64,849 athletes · 2,431 centres · 75 sports · 65,418 enrolments**).

**Stack:** Next.js 16 (App Router) · TypeScript · PostgreSQL (Drizzle ORM) · Tailwind CSS 4 · Vitest · Playwright · GitHub Actions · Vercel.

## What it does

| Area                    | Capability                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Athlete registry**    | Search by name / KIT id / id; filter by sport, centre type, state, gender, residential status, data issues. Athlete detail with enrolments, kit sizes and findings.                            |
| **Centres**             | 2,431 academies/centres across 9 types (Academy, NCOE, SATC, NSTC, ABSC, SKIC, KICE …) with athlete counts, sport mix, size coverage.                                                          |
| **Kit & shoe planning** | Quantity required per size (shoe, t-shirt, blazer, pant) for any selection, who is still missing a size, kit-issued tracking, grouped by centre / sport / centre type / state, **CSV export**. |
| **Data quality**        | 21 automatic rules (impossible dates, KIT-id vs gender/birth-year, placeholder values, duplicates, …) with drill-down. Invalid values are **never stored**.                                    |
| **Import pipeline**     | Idempotent, transactional, dry-run first. CLI for the national master; web upload (≤ 4 MB) for centre files. Preserves manual edits, never blanks known values, never deletes.                 |
| **Access control**      | Four roles; centre users see only their assigned centres. Personal details (DOB, parents) gated by capability. Audit log for logins, edits, imports, user changes.                             |
| **Dashboards**          | National / centre overview: centre types, sports, states, gender, residency, age profile, profile completeness.                                                                                |

## Quick start (no database to install)

```bash
nvm use                 # Node 22
npm ci
npm run db:seed         # synthetic demo data in ./.data/pglite (embedded Postgres)
npm run dev             # http://localhost:3000
```

Demo logins (password `Demo-Passw0rd-2026`): `admin@rcms.test`, `hq@rcms.test`, `centre@rcms.test`, `analyst@rcms.test`.

Prefer a real Postgres? `docker compose up -d` then
`DATABASE_URL=postgres://rcms:rcms@localhost:5432/rcms npm run db:migrate && npm run db:seed`.

### Load the real workbook

```bash
npm run import:athletes -- ./RC_monitoring_Athlete_Details_V1.xlsx --dry-run   # validate + diff, writes nothing
npm run import:athletes -- ./RC_monitoring_Athlete_Details_V1.xlsx             # apply (≈20 s for 65k rows)
```

> ⚠️ The workbook contains personal data of **minors** (names, parents, DOB, encrypted phone numbers).
> `*.xlsx` is git-ignored – never commit it or paste it into tickets. Tests and demos use **synthetic** data only.

## Commands

| Command                              | Purpose                                                      |
| ------------------------------------ | ------------------------------------------------------------ |
| `npm run dev` / `build` / `start`    | Next.js                                                      |
| `npm run check`                      | format check + lint + typecheck + tests (what CI runs first) |
| `npm test` · `npm run test:coverage` | Vitest unit + integration (embedded Postgres, no setup)      |
| `TEST_DATABASE_URL=… npx vitest run` | Same suite on a real Postgres (**wipes that database**)      |
| `npm run build && npm run test:e2e`  | Playwright against the production build                      |
| `npm run db:generate`                | Generate a migration after editing `src/server/db/schema.ts` |
| `npm run db:migrate`                 | Apply migrations to `DATABASE_URL`                           |
| `npm run db:bootstrap-admin`         | Create the first admin (`ADMIN_EMAIL`, `ADMIN_PASSWORD`)     |

## Deploying

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** – connect the repo in Vercel, add the Neon database from Vercel → Storage (it injects `DATABASE_URL`), add `AUTH_SECRET`, deploy.
Every push to a branch gets a Preview; every merge to `main` goes to Production, gated by CI.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – layers, decisions, request flow, security model
- [docs/DATA.md](docs/DATA.md) – what the workbook contains, how it is modelled, every data-quality rule
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) – Vercel + database setup, CI/CD, rollback, go-live checklist
- [SECURITY.md](SECURITY.md) – data-protection rules and vulnerability reporting
- [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) – conventions for AI coding agents

## Roadmap (next, in priority order)

1. **Monthly / quarterly report engine** (design: `RCMS_Bulk_Upload_Approach`). Needs the authoritative report catalog and sheet→report alias map from the codebase owner; the registry, scoping, audit and import foundations here are built to carry it. Competition reports can then pick athletes from the registry.
2. Authoritative **state / region** data on centres (today inferred from the centre code: 91 % of centres, 83 % of athletes) and a region hierarchy for regional officers.
3. Resolve flagged data issues in-app (merge possible duplicates, correct DOB) with audit trail.
4. Email/webhook notifications, SSO (DigiLocker / government IdP), per-centre kit procurement orders.
