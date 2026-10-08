# Deployment (Vercel + Neon) and CI/CD

RCMS has **no login module**. The first page is a user-type selection (Administrator, HQ officer, Centre user, Analyst) and each
button opens that portal with that role's permissions. The only required configuration is the database.

> ⚠️ **Anyone with the link can open every portal, including Administrator (edit + import).** This is a prototype.
> The workbook holds personal data of **minors**, so before loading the real data turn on **Vercel Deployment Protection**
> (Project → Settings → Deployment Protection → _Vercel Authentication_, for Production and Preview) or keep the site on a VPN.
> Date of birth and parents' names are **hidden in every portal by default**; set `RCMS_PROTOTYPE_SHOW_PII=1` only on a protected deployment.
> Phone numbers (ciphertext in the source) are never returned by any API.

## 1. Setup checklist (Vercel + Neon)

1. **Branch.** All work happens on **`dev`**. In GitHub → Settings → Branches set the default branch to `dev`, and in Vercel →
   Settings → Git set **Production Branch = `dev`**. (Otherwise Vercel keeps deploying an older branch – a page titled "RCMS" with an
   Email/Password form is an old commit.)
2. **Database.** Vercel → Storage → **Neon** → connect to the project for Production, Preview and Development. Neon injects:

   | Injected variable                                 | Used for                                                    |
   | ------------------------------------------------- | ----------------------------------------------------------- |
   | `DATABASE_URL` (pooled, host contains `-pooler`)  | the running app (serverless functions)                      |
   | `DATABASE_URL_UNPOOLED` (direct)                  | migrations in `vercel-build` and the CLI importer           |
   | `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `PG*` | aliases – RCMS reads them as fallbacks, nothing else needed |

   RCMS is Neon-ready: `prepare:false` (PgBouncer transaction mode), `sslmode=require`, 15 s connect timeout (scale-to-zero cold start),
   DDL/imports on the direct connection. Any Postgres 14+ works – just set `DATABASE_URL`.

3. **Deploy.** Framework preset Next.js; `vercel.json` sets `npm ci` and `npm run vercel-build`, which runs the migrations and then `next build`.
   Production builds always apply pending migrations. Preview builds apply them only when the database is still empty (no `athletes` table)
   or when `ALLOW_PREVIEW_MIGRATE=1` is set, so a PR can never change a shared database by accident.
4. **Check.** Open `https://<app>.vercel.app/api/health` → `"status":"ok"`, `"migrations":true`. `"data":false` just means no data yet.
   `"version"` is the first 7 characters of the deployed commit. The first page must show **four user-type buttons** and no password field.
5. **Load the workbook into Neon (from the browser, no CLI needed).** Home → **Administrator** → **Data imports** → choose
   `RC_monitoring_Athlete_Details_V1.xlsx` → **Validate (dry run)** to preview → **Import**. Keep the tab open (≈ 1 minute for 65 k rows).
   The browser reads the workbook, uploads it in 1,000-row batches (Vercel limits a request body to 4.5 MB), and the server stages the rows
   in Postgres, then runs the import in one transaction. Re-importing the same file changes nothing (idempotent); a failed or abandoned upload
   leaves the registry untouched and is cleaned up automatically after 24 h.
   Expected totals for V1: **64,849 athletes · 2,431 centres · 75 sports** on the Dashboard.
6. **No data yet and just want to look around?** Administrator → _Load synthetic demo data_ (only offered while the registry is empty).

### Alternative: import from a terminal

```bash
vercel env pull .env.production.local --environment=production   # then: set -a; . ./.env.production.local; set +a
npm run import:athletes -- ./RC_monitoring_Athlete_Details_V1.xlsx --dry-run
npm run import:athletes -- ./RC_monitoring_Athlete_Details_V1.xlsx
```

Both paths run the same code and produce identical data (verified on a 65 k-row workbook: row counts and hashes of athletes, enrolments and
data-quality findings are equal). **Never run `db:seed` against a database that holds real data.**

### Preview databases (recommended)

In the Neon integration enable _Create a database branch for each preview deployment_ and set `ALLOW_PREVIEW_MIGRATE=1` for the Preview
scope only. A preview branch contains a copy of production data, so keep Deployment Protection on for Previews.

## 2. CI/CD flow

```
feature branch ──push──► GitHub Actions CI ─┐            ┌─► Vercel Preview URL (per branch / PR)
                         ├ format, lint, types           │
                         ├ migration drift check         │
                         ├ unit+integration (PGlite)     │
                         ├ same suite on Postgres 16     │
                         ├ e2e: prod build + Postgres    │
                         └ npm audit (prod deps)         │
PR ──review + "CI passed" required──► merge to dev ──► Vercel Production deploy ──► post-deploy smoke test
```

- **CI** (`.github/workflows/ci.yml`) – one required check, **`CI passed`**, aggregates all jobs.
- **CD** – Vercel's Git integration deploys; GitHub is the gate. Nothing deploys to Production except `dev` (the Production Branch).
- **Post-deploy smoke** (`post-deploy-smoke.yml`) fires on Vercel's `deployment_status`; checks `/api/health` (DB reachable), security headers, and that an API call without a chosen portal is 401. If Previews sit behind Vercel Authentication, add the repo secret `VERCEL_AUTOMATION_BYPASS_SECRET` (Vercel → Settings → Deployment Protection → Protection Bypass for Automation), otherwise the job skips with a notice.
- **Dependabot** opens weekly grouped npm PRs and monthly Action updates; **CodeQL** runs weekly (public repos / GHAS).

### Recommended GitHub settings (Settings → Branches → rule for `dev`)

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

| Concern | How                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Uptime  | Point any monitor at `/api/health` (200 = app + DB up, 503 = DB down)                                                                                                                      |
| Logs    | Vercel → Logs (structured `console.error` for unhandled API errors; no PII is logged)                                                                                                      |
| Audit   | `audit_log` table, `GET /api/audit` (admin)                                                                                                                                                |
| Backups | Neon PITR (set retention ≥ 7 days) – **this database holds minors' data; confirm retention policy**                                                                                        |
| Secrets | There are none besides the database URL (rotate it in Neon; Vercel redeploys)                                                                                                              |
| Scaling | Serverless functions scale out; each instance keeps ≤ `DB_POOL_MAX` (default 5) connections to Neon's pooler, which multiplexes up to thousands of clients – no tuning needed at this size |
| Cost    | Neon scales compute to zero when idle (first request after idle is a bit slower); raise the autosuspend delay or minimum compute if that matters                                           |

## 6. Go-live checklist

- [ ] GitHub default branch and Vercel Production Branch are `dev`; Dependabot targets `dev` (already configured)
- [ ] Neon integration connected to Production + Preview (`DATABASE_URL` pooled and `DATABASE_URL_UNPOOLED` present); region India/Singapore
- [ ] **Vercel Deployment Protection enabled (Production and Previews) before the real workbook is imported**
- [ ] `RCMS_PROTOTYPE_SHOW_PII` unset (DOB / parents hidden) unless the deployment is protected and the need is documented
- [ ] Workbook imported from the Administrator portal; Dashboard totals match the source (64,849 / 2,431 / 75 for V1); Data imports history shows the run
- [ ] Demo data **not** present in a real-data database (the loader refuses a non-empty registry)
- [ ] Branch protection on `dev` with `CI passed`
- [ ] Neon backup retention confirmed (≥ 7 days); data-protection owner informed that the system holds minors' PII
- [ ] Custom domain + HTTPS (HSTS is already sent)
