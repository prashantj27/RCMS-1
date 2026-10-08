# Architecture

## Shape

```
Browser ──► Next.js (Vercel, region bom1)
              ├─ Server Components  → services → Drizzle → Postgres
              ├─ Route Handlers /api/*  (same services; JSON)
              └─ Client islands: login, kit editor, import form, user admin
```

One deployable. No separate API service, queue or cache: at 65 k athletes every dashboard query runs in 100–300 ms
on a small Postgres, so extra moving parts would be cost without benefit. Revisit when the report engine lands.

```
src/
  domain/     pure TypeScript – no I/O. normalisers, identifiers, DQ rules, import mapping, permissions
  server/
    db/       schema (Drizzle), client (postgres-js | PGlite), helpers
    auth/     bcrypt, JWT session cookie, lockout, current-user, audit
    services/ athletes · academies · analytics · kit · dq · imports · users · lookups   (all take `db`, `user`)
    import/   file parsing, plan diff + transactional apply, orchestrator
    http.ts   route wrapper: CSRF check → auth → capability → JSON/error mapping
  app/        pages + /api routes (thin: parse input → call service)
  dev/        synthetic data generator + demo seed (never imported by app code)
scripts/      migrate · import-athletes · seed · bootstrap-admin · e2e-prepare
drizzle/      SQL migrations (generated, committed)
```

**Rules that keep it maintainable**

- `domain/` imports nothing from `server/` – every business rule is unit-testable without a database.
- Pages and API routes never contain SQL; they call a service. Services take `(db, user, input)` so tests can inject a database and a user.
- Every list/aggregate query is built from the same filter + **scope** fragments (`services/filters.ts`), so a centre user can never see more through one endpoint than another. This is covered by tests.

## Key decisions

| Decision                                     | Why                                                                                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js + Postgres instead of NestJS + React | Deploys to Vercel with zero adapters; one language and one deploy. The domain/service split makes a later extraction to a standalone API mechanical.                                           |
| Athlete ≠ enrolment                          | The workbook has one row per athlete × academy: 65,508 rows are 64,849 athletes. 35 athletes sit in 13 centres each. Modelling `athletes` and `enrollments` separately avoids double counting. |
| Source ids are primary keys                  | `player_detail_id`, `academy_detail_id`, `role_detail_id` are kept as ids so re-imports are idempotent upserts and records stay traceable to the source system.                                |
| Embedded Postgres (PGlite) for dev & tests   | Contributors need no install; CI additionally runs the whole suite and e2e on real Postgres 16 so driver differences cannot hide.                                                              |
| Import = upsert only                         | A re-import can never delete or blank data. Kit data edited in the app is protected (`edited_at`).                                                                                             |
| Values that fail validation are not stored   | A 1882 birth date or size `0` is worse than empty. The finding is kept (with the raw value) in `dq_issues`.                                                                                    |
| Aggregates count athletes once per grouping  | Totals are `count(distinct athlete)`. Group-by-centre rows can exceed the total because multi-centre athletes appear in each centre – the UI says so.                                          |
| Server-rendered filters (GET forms)          | Shareable URLs, works without JS, no client state to desync.                                                                                                                                   |

## Security model

- **AuthN:** email + password (bcrypt cost 12, 12-char minimum). Session = HS256 JWT in an `httpOnly`, `SameSite=Lax`, `Secure` cookie, 8 h. The token carries a fingerprint of the password hash, so a password change signs the user out everywhere. The user row is re-read on every request: deactivation is immediate.
- **Brute force:** 5 failures → 15-minute lock (stored in DB, so it works across serverless instances). Unknown users cost the same bcrypt time as real ones; errors are generic.
- **AuthZ:** capabilities per role (`domain/permissions.ts`). **Scope**: `CENTRE_USER` is restricted to assigned academies in _every_ query; out-of-scope records return **404**, not 403.
- **PII:** DOB and parents require `athletes:read_pii`. Phone numbers are stored only as the opaque ciphertext from the source file and are **never returned by any API**; plaintext numbers in a file are rejected, not stored.
- **CSRF:** all mutations require same-origin (`Origin` / `Sec-Fetch-Site`), on top of `SameSite=Lax`.
- **Injection:** all SQL is parameterised; LIKE wildcards in search are escaped; CSV export neutralises spreadsheet formulas.
- **Headers:** CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer and permissions policies; API responses `no-store`. `robots: noindex`.
- **Uploads:** size-capped (4 MB), content-sniffed (ZIP magic for xlsx), row-capped; parsing never executes content.
- **Audit:** login/logout/failed/blocked, kit edits (before → after), imports, user changes.

## Performance (65 k athletes, real data, Postgres 16)

| Request                              | Time     |
| ------------------------------------ | -------- |
| Athlete list page / name search      | 40–90 ms |
| Dashboard overview (10 aggregates)   | ≈ 200 ms |
| Kit demand grouped by centre (2,431) | ≈ 100 ms |
| Data-quality summary                 | ≈ 15 ms  |
| Full national import (CLI)           | ≈ 19 s   |

Independent queries run concurrently. If the dashboard becomes the hot path, cache `getOverview` per scope key for a
few minutes (`unstable_cache`) – not needed at this size.
