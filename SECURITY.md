# Security policy

## Data protection rules (non-negotiable)

This system processes personal data of **minors** (names, parents' names, dates of birth, encrypted phone numbers).

1. **Never commit real data.** `*.xlsx`, `*.xls`, `*.csv` and `data/` are git-ignored. Tests, demos and screenshots use the synthetic generator in `src/dev/`.
2. **Never decrypt, log or return phone numbers.** They are stored as opaque ciphertext and are not exposed by any API.
3. **Least privilege.** New endpoints must declare a capability and apply the caller's `Scope`; add a test proving a centre user cannot reach other centres' data.
4. **No secrets in the repo.** Configuration comes from environment variables (`.env.example` lists them). Account passwords live only in the host's environment (mark them _Sensitive_ in Vercel) and are stored in the database only as bcrypt hashes.
5. **Production data stays in production.** Do not copy it to Preview/dev databases; use `npm run db:seed`.

## Reporting a vulnerability

Please do **not** open a public issue. Report privately via GitHub → Security → _Report a vulnerability_,
or email the repository maintainers. Include steps to reproduce and the affected version. We aim to acknowledge within 2 working days.

## Automated safeguards

CI runs `npm audit` (production deps, fail on high), Dependabot updates weekly, CodeQL scans weekly (where available),
and the e2e suite asserts security headers, CSRF rejection, role boundaries and anonymous 401s on every change.
