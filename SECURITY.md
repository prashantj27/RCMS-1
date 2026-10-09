# Security policy

## Data protection rules (non-negotiable)

This system processes personal data of **minors** (names, parents' names, dates of birth, encrypted phone numbers).

1. **Never commit real data.** `*.xlsx`, `*.xls`, `*.csv` and `data/` are git-ignored. Tests and local development use the synthetic generator in `src/dev/`.
2. **Never decrypt, log or return phone numbers.** They are stored as opaque ciphertext and are not exposed by any API.
3. **Least privilege.** New endpoints must declare a capability and apply the caller's `Scope`; add a test proving a centre user cannot reach other centres' data.
4. **No secrets in the repo.** Configuration comes from environment variables (`.env.example` lists them).
5. **Production data stays in production.** Do not copy it to Preview/dev databases; use `npm run db:seed`.

## No login module

RCMS has **no authentication**. The home page lets anyone choose a user type and open that portal (permissions are still enforced per portal,
and the centre portal is limited to one centre), but _who_ is using it is not verified. Therefore: **protect the deployment at platform level**
(Vercel Deployment Protection, VPN, IP allow-list) before any real athlete data is loaded. Date of birth and parents' names are hidden in every
portal unless `RCMS_PROTOTYPE_SHOW_PII=1`; phone ciphertext is never returned.

## Reporting a vulnerability

Please do **not** open a public issue. Report privately via GitHub → Security → _Report a vulnerability_,
or email the repository maintainers. Include steps to reproduce and the affected version. We aim to acknowledge within 2 working days.

## Automated safeguards

CI runs `npm audit` (production deps, fail on high), Dependabot updates weekly, CodeQL scans weekly (where available),
and the e2e suite asserts security headers, CSRF rejection, role boundaries and portal-less 401s on every change.
