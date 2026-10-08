## What & why

<!-- One or two sentences. Link the issue. -->

## Checklist

- [ ] `npm run check` passes locally (format, lint, types, tests)
- [ ] Schema change? Added a migration (`npm run db:generate`) – additive/backwards-compatible so the previous deploy keeps working during rollout
- [ ] No real athlete data, secrets or `.xlsx` workbooks committed (they contain minors' personal data)
- [ ] New endpoints/pages check capabilities **and** centre scope (`Scope`), and have a test
- [ ] UI changes checked at mobile width and with keyboard only

## Screenshots / notes for reviewers
