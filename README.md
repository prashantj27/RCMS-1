# RCMS – Regional Centre Monitoring System

Athlete registry, data-quality control and kit & shoe planning for Khelo India / SAI centres.
Built from the national athlete master workbook (final version `RC_monitoring_Athlete_Details_CLEANED_Unique.xlsx`: one row per athlete →
**64,849 athletes · 2,410 centres · 75 sports · 64,822 enrolments**).

**Stack:** Next.js 16 (App Router) · TypeScript · PostgreSQL (Drizzle ORM) · Tailwind CSS 4 · Vitest · Playwright · GitHub Actions · Vercel.

## What it does

| Area                    | Capability                                                                                                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Athlete registry**    | Search by name / KIT id / id; filter by sport, centre type, state, gender, residential status, data issues. Athlete detail with enrolments, kit sizes and findings.                                                                                        |
| **Centres**             | 2,431 academies/centres across 9 types (Academy, NCOE, SATC, NSTC, ABSC, SKIC, KICE …) with athlete counts, sport mix, size coverage.                                                                                                                      |
| **Kit & shoe planning** | Quantity required per size (shoe, t-shirt, blazer, pant) for any selection, who is still missing a size, kit-issued tracking, grouped by centre / sport / centre type / state, **CSV export**.                                                             |
| **Data quality**        | 21 automatic rules (impossible dates, KIT-id vs gender/birth-year, placeholder values, duplicates, …) with drill-down. Invalid values are **never stored**.                                                                                                |
| **Import pipeline**     | Idempotent, transactional, dry-run first. Upload the national workbook from the Administrator portal (read in the browser, sent in small batches, so it works on Vercel) or use the CLI. Preserves manual edits, never blanks known values, never deletes. |
| **Access control**      | No login: choose a user type on the first page. Four portals with fixed permissions; the centre portal sees one centre. DOB and parents' names are hidden by default. Audit log for kit edits and imports.                                                 |
| **Dashboards**          | National / centre overview: centre types, sports, states, gender, residency, age profile, profile completeness.                                                                                                                                            |

## Quick start (no database to install)

```bash
nvm use                 # Node 22
npm ci
npm run db:seed         # OPTIONAL: fictional data for local development only (refuses a database that holds athletes)
npm run dev             # http://localhost:3000
```

**There is no sign-in.** The first page offers one button per user type – **Administrator, HQ officer, Centre user, Analyst** –
and each opens that role's portal with exactly that role's permissions. The Centre user button first asks which centre you want to be.
Every page has a **Home** button (and a banner) to go back and switch user type.

> ⚠️ **There is no login module: anyone who can open the URL can use every portal, including editing and importing.**
> Use synthetic data, or put the whole site behind Vercel Deployment Protection / a VPN before loading real data.
> Date of birth and parents' names are hidden by default (`RCMS_PROTOTYPE_SHOW_PII=1` shows them).

**Real data only.** The deployed app has no demo data. The athlete master workbook (final version: `RC_monitoring_Athlete_Details_CLEANED_Unique.xlsx`, one row per athlete: 64,849 athletes · 2,410 centres · 75 sports · 64,822 enrolments) is loaded once from
_Administrator → Data imports_ and is stored in the Postgres/Neon database; every portal reads it from there, it survives redeploys, and re-importing the
same file changes nothing. The Data imports page shows the current data and which workbook it came from.

Prefer a real Postgres? `docker compose up -d` then
`DATABASE_URL=postgres://rcms:rcms@localhost:5432/rcms npm run db:migrate && npm run db:seed`.

### Load the real workbook

```bash
npm run import:athletes -- ./RC_monitoring_Athlete_Details_V1.xlsx --dry-run   # validate + diff, writes nothing
npm run import:athletes -- ./RC_monitoring_Athlete_Details_V1.xlsx             # apply (≈20 s for 65k rows)
```

> ⚠️ The workbook contains personal data of **minors** (names, parents, DOB, encrypted phone numbers).
> `*.xlsx` is git-ignored – never commit it or paste it into tickets. Automated tests use **synthetic** data only.

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
| `npm run import:athletes -- file`    | Import the workbook from a terminal (`--dry-run` to preview) |

## Deploying

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** – connect the repo in Vercel (Production Branch **`dev`**), add the Neon database from Vercel → Storage (it injects `DATABASE_URL`), deploy, then import the workbook from the Administrator portal. No other variables are needed.
Every push to a branch gets a Preview; every merge to `dev` goes to Production, gated by CI.

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
