# Deployment (Vercel + Postgres) and CI/CD

## 1. One-time setup

### 1.1 Create the Neon database from Vercel (recommended)

1. Vercel → your project → **Storage** → **Create Database** → **Neon** (Marketplace) → pick the region closest to your users
   (India/Singapore, i.e. the AWS Asia-Pacific region Neon offers) → connect it to this project for **Production, Preview and Development**.
2. Neon injects the connection variables automatically – you do not copy anything by hand:

   | Injected variable                                 | Used for                                                    |
   | ------------------------------------------------- | ----------------------------------------------------------- |
   | `DATABASE_URL` (pooled, host contains `-pooler`)  | the running app (serverless functions)                      |
   | `DATABASE_URL_UNPOOLED` (direct)                  | migrations in `vercel-build` and the CLI importer           |
   | `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `PG*` | aliases – RCMS reads them as fallbacks, nothing else needed |

3. **Preview databases (recommended):** in the integration settings enable **Create a database branch for each preview deployment**.
   Each PR then gets an isolated copy-on-write branch of production data's _schema and data_; because that copy can contain real athlete
   records, keep Vercel **Deployment Protection** on for Previews. Then add `ALLOW_PREVIEW_MIGRATE=1` (Preview scope only) so new migrations
   are applied to each preview branch. Without branching, leave it unset: previews will not touch the database schema.

RCMS is Neon-ready: `prepare:false` (PgBouncer transaction mode), `sslmode=require` honoured, connect timeout 15 s (covers Neon's
scale-to-zero cold start of a few hundred ms), DDL/imports on the direct connection. Any other Postgres 14+ works too – just set `DATABASE_URL`.

### 1.2 Connect the repo to Vercel

1. Vercel → **Add New → Project → Import Git Repository** → `KheloIndiaAI/RCMS`.
2. Framework preset: **Next.js** (auto-detected). Leave build/install commands – `vercel.json` sets `npm ci` and `npm run vercel-build`.
3. **Environment Variables:** `DATABASE_URL*` already come from the Neon integration (step 1.1). Add:

   | Variable                  | Value                                                                                         |
   | ------------------------- | --------------------------------------------------------------------------------------------- |
   | `AUTH_SECRET`             | `openssl rand -base64 48` (different for Production and Preview)                              |
   | `RCMS_ADMIN_PASSWORD`     | password for login **`admin`**                                                                |
   | `RCMS_HQ_PASSWORD`        | password for login **`hq`**                                                                   |
   | `RCMS_CENTRE_PASSWORD`    | password for login **`centre`**                                                               |
   | `RCMS_CENTRE_ACADEMY_IDS` | comma-separated centre ids the `centre` login may see, e.g. `3010,888` (see the Centres page) |
   | `RCMS_ANALYST_PASSWORD`   | password for login **`analyst`**                                                              |

   Rules: login ids are the plain usernames `admin`, `hq`, `centre`, `analyst` (case-insensitive; override with `RCMS_<ROLE>_USERNAME`).
   Passwords must be ≥ 12 characters and must not contain the username (so `admin@12345` is rejected). An account whose password
   variable is unset is simply not created. Mark the password variables **Sensitive** in Vercel.

4. Deploy. `vercel-build` runs migrations **before** `next build` (Production only by default – see section 3).

### 1.3 Accounts and first data load

**Accounts.** On every Production build, `vercel-build` runs `scripts/provision-users.ts` after the migrations: it creates the accounts above
and, if you later change a password variable and redeploy, updates that account's password (old sessions end). It never deletes users,
never re-enables an account an admin deactivated, and never changes an existing account's role. Problems (for example a password that
breaks the policy) are printed as warnings in the build log and do **not** fail the deploy – check the log line `[provision] …`.

**Data.** The 10 MB workbook exceeds Vercel's 4.5 MB request limit, so load it once from your machine:

```bash
# Pull the Neon variables Vercel already holds (Production):
vercel env pull .env.production.local --environment=production   # then: set -a; . ./.env.production.local; set +a
# (or export DATABASE_URL_UNPOOLED='postgres://…/neondb?sslmode=require' by hand – the CLI prefers the direct URL)
npm run import:athletes -- ./RC_monitoring_Athlete_Details_V1.xlsx --dry-run
npm run import:athletes -- ./RC_monitoring_Athlete_Details_V1.xlsx
```

**Order matters for the `centre` account.** A brand-new database has no centres until the workbook is loaded, so on the very first deploy
the `centre` account is reported as `skipped`. After the import: look up the centre ids (sign in as `admin` → Academies & centres),
set `RCMS_CENTRE_ACADEMY_IDS`, and redeploy (or run `npm run db:provision-users` locally with the same variables). From then on it is kept in sync.

Then sign in as `admin` at your Vercel URL and verify `GET /api/health` → `{"status":"ok","db":"up"}`.

## 2. CI/CD flow

```
feature branch ──push──► GitHub Actions CI ─┐            ┌─► Vercel Preview URL (per branch / PR)
                         ├ format, lint, types           │
                         ├ migration drift check         │
                         ├ unit+integration (PGlite)     │
                         ├ same suite on Postgres 16     │
                         ├ e2e: prod build + Postgres    │
                         └ npm audit (prod deps)         │
PR ──review + "CI passed" required──► merge to main ──► Vercel Production deploy ──► post-deploy smoke test
```

- **CI** (`.github/workflows/ci.yml`) – one required check, **`CI passed`**, aggregates all jobs.
- **CD** – Vercel's Git integration deploys; GitHub is the gate. Nothing deploys to Production except `main`.
- **Post-deploy smoke** (`post-deploy-smoke.yml`) fires on Vercel's `deployment_status`; checks `/api/health` (DB reachable), security headers, and that anonymous API access is 401. If Previews sit behind Vercel Authentication, add the repo secret `VERCEL_AUTOMATION_BYPASS_SECRET` (Vercel → Settings → Deployment Protection → Protection Bypass for Automation), otherwise the job skips with a notice.
- **Dependabot** opens weekly grouped npm PRs and monthly Action updates; **CodeQL** runs weekly (public repos / GHAS).

### Recommended GitHub settings (Settings → Branches → rule for `main`)

- Require a pull request, ≥ 1 approval; **Require status checks: `CI passed`**; require branches up to date.
- Block force-pushes and deletions. Optionally add a `CODEOWNERS` file once a maintainers team exists.

## 3. Database migrations

- Change `src/server/db/schema.ts` → `npm run db:generate` → commit `drizzle/*.sql` (CI fails if you forget).
- **Production** builds apply pending migrations automatically (`scripts/migrate.ts --vercel`), idempotently.
- **Preview** builds **skip** migrations by default so a PR can never alter a shared database. Choose one:
  - _Recommended:_ Neon's Vercel integration creates a **database branch per preview**; set `ALLOW_PREVIEW_MIGRATE=1` for the Preview environment so each branch is migrated.
  - Or point Preview at a separate throw-away database and set `ALLOW_PREVIEW_MIGRATE=1`.
- **Write migrations expand-then-contract** (add columns/tables first; remove old ones in a later release) because the previous deployment keeps serving traffic until the new one is promoted.

## 4. Rollback

- **App:** Vercel → Deployments → previous Production deployment → **Promote to Production** (instant, no rebuild).
- **Database:** migrations are forward-only. Because they are additive, the previous app version keeps working against the newer schema. For data mistakes, restore a Neon point-in-time branch.
- **A bad import:** every batch id is stored on the rows it touched (`athletes.last_import_batch_id`, `dq_issues.batch_id`); restore from a Neon branch / point-in-time snapshot taken before the import – create one first for large loads.

## 5. Operations

| Concern          | How                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Uptime           | Point any monitor at `/api/health` (200 = app + DB up, 503 = DB down)                                                                                                                      |
| Logs             | Vercel → Logs (structured `console.error` for unhandled API errors; no PII is logged)                                                                                                      |
| Audit            | `audit_log` table, `GET /api/audit` (admin)                                                                                                                                                |
| Backups          | Neon PITR (set retention ≥ 7 days) – **this database holds minors' data; confirm retention policy**                                                                                        |
| Secrets rotation | Change `AUTH_SECRET` → everyone is signed out. Change a user's password → only their sessions end                                                                                          |
| Scaling          | Serverless functions scale out; each instance keeps ≤ `DB_POOL_MAX` (default 5) connections to Neon's pooler, which multiplexes up to thousands of clients – no tuning needed at this size |
| Cost             | Neon scales compute to zero when idle (first request after idle is a bit slower); raise the autosuspend delay or minimum compute if that matters                                           |

## 6. Go-live checklist

- [ ] `AUTH_SECRET` set (≥ 32 random chars) in Production; different from Preview
- [ ] Neon integration connected to Production + Preview (`DATABASE_URL` pooled and `DATABASE_URL_UNPOOLED` present); region India/Singapore
- [ ] `RCMS_*_PASSWORD` variables set (marked Sensitive); build log shows `[provision] … created/unchanged` for admin, hq, centre, analyst; demo data **not** present (never run `db:seed` on production)
- [ ] National workbook imported; dashboard totals match the source (64,849 / 2,431 / 75 for V1)
- [ ] Branch protection on `main` with `CI passed`
- [ ] Vercel Deployment Protection enabled for Previews (they can show real data if pointed at it)
- [ ] Neon backup retention confirmed; data-protection owner informed that the system holds minors' PII
- [ ] Custom domain + HTTPS (HSTS is already sent)
