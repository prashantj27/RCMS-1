# Data: the athlete master workbook

Source: `RC_monitoring_Athlete_Details_V1.xlsx`, sheet **AthleteMaster**, 22 columns, 65,508 rows.

## What the file really is

| Fact (verified on the real file)                                                            | Consequence in RCMS                                                                              |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 64,849 distinct `player_detail_id`; 659 rows repeat an athlete                              | One row per athlete × centre → `athletes` + `enrollments`                                        |
| Athlete attributes never differ between repeated rows; only centre/role/joining do          | Safe to merge; conflicts are counted and reported (0 in V1)                                      |
| 2,431 distinct `academy_detail_id`; name/code/role/active are consistent per id             | `academies` keyed by source id                                                                   |
| 4 academy codes are shared by 19 academy ids                                                | Flagged `ACADEMY_CODE_SHARED`                                                                    |
| Missing values are the literal text `NULL` (45k in size columns alone)                      | `cleanText()` normalises to real NULL                                                            |
| Every athlete has exactly one sport; 75 sports; "Para-Archery" vs "Para - Archery"          | Para names canonicalised to `Para - X`                                                           |
| `mobile_number` is AES ciphertext (24-char base64); 8 plain integers; 3 truncated blobs     | Ciphertext kept opaque and never exposed; non-ciphertext rejected                                |
| `athlete_kitd_id` = `SSAAnnnGyy` (sport prefix, series, serial, **gender**, **birth year**) | Used as a cross-check: 88 gender and 247 birth-year disagreements                                |
| Academy code `MSAA000UP21` embeds a state code (`UP`) for 2,204 of 2,431 centres            | State **inferred** for those; the other 227 (NCOE/SATC/NSTC/ABSC schemes) are "not determinable" |
| `type_of_athelete` (sic) is NULL for 4,254 enrolments                                       | Info-level finding; header alias for the corrected spelling is accepted                          |

## Tables

`centre_types` · `sports` · `academies` · `athletes` · `enrollments` · `dq_issues` · `import_batches` · `audit_log` · `import_stages` · `import_stage_rows` (temporary upload staging)
(see `src/server/db/schema.ts`; ids of source entities are preserved).

Centre types (from `role_detail_id`): 6 Academy · 29 NCOE (SAI) · 40 SATC (SAI) · 41 ABSC (SAI) · 42 SKIC (SAI) · 43 NSTC (SAI) · 69 ABSC (SLKIC) · 80 KICE (SLKIC) · 82 SKIC (SLKIC).
Labels are used exactly as in the file; acronyms are not expanded because the file does not define them.

## Import semantics

1. **Parse** (`.xlsx` via `read-excel-file`, `.csv`) → header check (6 required columns).
2. **Plan** (pure): normalise every row, reject unusable rows (bad id/gender/sport), merge duplicates, derive findings.
3. **Diff** against the database (new vs existing, KIT-id clashes with other athletes → rejected, manually edited athletes).
4. **Apply** in one transaction: upsert centre types → sports → academies → athletes → enrolments, replace import-managed findings for the affected entities, re-derive `POSSIBLE_DUPLICATE`.

Guarantees: re-running a file is a no-op; blank cells never erase known values; nothing is ever deleted; kit sizes/kitting date edited in the app survive re-imports.

## Data-quality rules (`src/domain/dq-rules.ts`)

Severity: **error** = unusable · **warning** = probably wrong · **info** = note. Counts are for the V1 workbook as of 2026-10-08.

| Rule                     | Sev     | Count | Meaning                                                 |
| ------------------------ | ------- | ----: | ------------------------------------------------------- |
| `JOIN_BEFORE_BIRTH`      | error   |    99 | Joining date earlier than date of birth                 |
| `DOB_INVALID`            | error   |     3 | DOB unparseable / outside 1900–today (not stored)       |
| `NAME_MISSING`           | error   |     2 | Empty name                                              |
| `ACADEMY_NAME_MISSING`   | error   |     0 | Empty academy name                                      |
| `INACTIVE_ACADEMY`       | warning | 1,141 | Athlete enrolled in an academy flagged inactive         |
| `SIZE_INVALID`           | warning |   651 | Shoe 0, t-shirt `36`, pant `7` … (not stored)           |
| `POSSIBLE_DUPLICATE`     | warning |   278 | Same name + DOB + father under different ids            |
| `KITID_YEAR_MISMATCH`    | warning |   247 | Birth year in KIT id ≠ DOB                              |
| `DOB_AGE_OUTLIER`        | warning |   206 | Age < 5 or > 50                                         |
| `KITID_GENDER_MISMATCH`  | warning |    88 | Gender letter in KIT id ≠ gender                        |
| `NO_ACADEMY`             | warning |    27 | Not enrolled anywhere                                   |
| `ACADEMY_CODE_SHARED`    | warning |    19 | One code, several academies                             |
| `JOIN_DATE_INVALID`      | warning |    14 | Joining date unparseable / < 1990 / future (not stored) |
| `MOBILE_INVALID`         | warning |    11 | Not ciphertext (plain digits are never stored)          |
| `KITID_FORMAT`           | warning |     0 | KIT id not `SSAAnnnGyy`                                 |
| `KITTING_DATE_INVALID`   | warning |     0 | Kitting date unparseable / future                       |
| `ATHLETE_TYPE_MISSING`   | info    | 4,254 | Residential status empty                                |
| `DOB_PLACEHOLDER_LIKELY` | info    | 1,543 | DOB is 1 January                                        |
| `PARENT_PLACEHOLDER`     | info    |   301 | "father", "mother", "abc" … (not stored)                |
| `JOIN_AGE_IMPLAUSIBLE`   | info    |   223 | Joined younger than 4                                   |
| `MULTI_ENROLLMENT`       | info    |    37 | Enrolled in ≥ 3 centres                                 |

## Known limits (be honest about these)

- **State is inferred**, not authoritative. 11,237 athletes (17 %) are in centres whose code carries no state.
- Parent names are missing for ~41 % of athletes; shoe/blazer/pant sizes are recorded for only ~29 %. The kit planner reports quantities from recorded sizes and counts the rest as "missing – measure first".
- "Possible duplicate" requires a known father's name to avoid false positives; athletes without one are not checked.
- Dates are calendar dates without time zones; the kitting timestamp is stored in UTC and shown in IST.
