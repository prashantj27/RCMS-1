/**
 * Deterministic SYNTHETIC athlete-master data in the exact shape of
 * RC_monitoring_Athlete_Details_V1.xlsx. Used for local seeding, tests and e2e –
 * never contains real people. Anomalies mirroring the real export (literal
 * "NULL", 1-January DOBs, shoe size 0, corrupted years, duplicate enrolments,
 * KIT-id mismatches …) are injected at fixed intervals so every data-quality
 * rule has something to find.
 */
export const SYNTHETIC_HEADER = [
  "player_detail_id",
  "athlete_kitd_id",
  "full_name",
  "father_full_name",
  "mother_full_name",
  "gender",
  "date_of_birth",
  "mobile_number",
  "sport_name",
  "role_detail_id",
  "academy_role",
  "academy_detail_id",
  "academy_kitd_id",
  "academy_name",
  "academy_is_active",
  "type_of_athelete",
  "date_of_joining",
  "shoe_size",
  "blazer_size",
  "tshirt_size",
  "pant_size",
  "kitting_updated_date",
] as const;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Aarav",
  "Diya",
  "Kabir",
  "Meera",
  "Rohan",
  "Isha",
  "Vihaan",
  "Anaya",
  "Arjun",
  "Tara",
  "Neel",
  "Riya",
  "Dev",
  "Kiara",
  "Yash",
  "Sana",
  "Ishaan",
  "Naina",
  "Veer",
  "Myra",
];
const LAST = [
  "Sharma",
  "Verma",
  "Singh",
  "Patel",
  "Nair",
  "Reddy",
  "Das",
  "Gupta",
  "Mehta",
  "Rao",
  "Joshi",
  "Kaur",
  "Iyer",
  "Bose",
  "Khan",
];
const FATHERS = ["Rajesh", "Suresh", "Mahesh", "Dinesh", "Ramesh", "Anil", "Sunil", "Vijay"];
const MOTHERS = ["Sunita", "Anita", "Kavita", "Poonam", "Rekha", "Seema", "Geeta", "Meena"];
const SPORTS: [string, string][] = [
  ["Football", "FO"],
  ["Athletics", "AT"],
  ["Hockey", "HO"],
  ["Boxing", "BO"],
  ["Wrestling", "WR"],
  ["Archery", "AR"],
  ["Badminton", "BA"],
  ["Volleyball", "VO"],
  ["Kabaddi", "KA"],
  ["Judo", "JU"],
  ["Swimming", "SW"],
  ["Para-Archery", "AR"],
];
const CENTRE_TYPES: [number, string][] = [
  [6, "Academy"],
  [82, "SKIC (SLKIC)"],
  [40, "SATC (SAI)"],
  [29, "NCOE (SAI)"],
  [80, "KICE (SLKIC)"],
];
const STATES = ["UP", "MH", "AS", "KA", "RJ", "TN", "HR", "DL", "OR", "PB"];
const LETTERS = ["XS", "S", "M", "L", "XL", "XXL"];

export interface SyntheticOptions {
  athletes?: number;
  academies?: number;
  seed?: number;
}

export function syntheticAthleteMatrix({ athletes = 600, academies = 24, seed = 42 }: SyntheticOptions = {}): unknown[][] {
  const rnd = mulberry32(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

  const acad = Array.from({ length: academies }, (_, i) => {
    const [roleId, roleLabel] = CENTRE_TYPES[i % CENTRE_TYPES.length]!;
    const id = 1000 + i;
    const state = STATES[i % STATES.length]!;
    return {
      id,
      roleId,
      roleLabel,
      // Pattern with embedded state code for most; the rest use a code without one (like NCOEAA009MS).
      code: i % 5 === 4 ? `NCOEAA${String(i).padStart(3, "0")}MS` : `MSAA000${state}${String(10 + i).padStart(2, "0")}`,
      name: `Demo ${roleLabel.split(" ")[0]} Centre ${String(i + 1).padStart(2, "0")}`,
      active: i % 11 === 10 ? 0 : 1,
    };
  });

  const out: unknown[][] = [[...SYNTHETIC_HEADER]];
  for (let n = 1; n <= athletes; n++) {
    const id = 100000 + n;
    const [sport, prefix] = pick(SPORTS);
    const gender = rnd() < 0.6 ? "M" : "F";
    const birthYear = int(2000, 2014);
    const dob = new Date(Date.UTC(birthYear, int(0, 11), int(1, 28)));
    const series = String.fromCharCode(65 + (Math.floor(n / 1000) % 26)) + String.fromCharCode(65 + (Math.floor(n / 26000) % 26));
    const kitId = `${prefix}${series}${String(n % 1000).padStart(3, "0")}${gender}${String(birthYear % 100).padStart(2, "0")}`;
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const ac = acad[(n * 7) % acad.length]!;
    const joined = new Date(Date.UTC(int(2019, 2025), int(0, 11), int(1, 28)));
    const hasSizes = rnd() < 0.5;
    const cipher = Buffer.from(Array.from({ length: 16 }, () => int(0, 255))).toString("base64");

    const row: Record<string, unknown> = {
      player_detail_id: id,
      athlete_kitd_id: kitId,
      full_name: name,
      father_full_name: `${pick(FATHERS)} ${pick(LAST)}`,
      mother_full_name: `${pick(MOTHERS)} ${pick(LAST)}`,
      gender,
      date_of_birth: dob,
      mobile_number: cipher,
      sport_name: sport,
      role_detail_id: ac.roleId,
      academy_role: ac.roleLabel,
      academy_detail_id: ac.id,
      academy_kitd_id: ac.code,
      academy_name: ac.name,
      academy_is_active: ac.active,
      type_of_athelete: rnd() < 0.5 ? "Residential" : "Non-Residential",
      date_of_joining: joined,
      shoe_size: hasSizes ? int(5, 11) : "NULL",
      blazer_size: hasSizes ? pick([30, 32, 34, 36, 38, 40, "M", "L"]) : "NULL",
      tshirt_size: pick(LETTERS),
      pant_size: hasSizes ? pick([26, 28, 30, 32, 34, "M"]) : "NULL",
      kitting_updated_date: hasSizes && rnd() < 0.4 ? new Date(Date.UTC(2025, int(0, 11), int(1, 28), 10, 30)) : "NULL",
    };

    // ── injected anomalies (fixed cadence → stable counts) ──
    if (n % 25 === 0) row.date_of_birth = new Date(Date.UTC(birthYear, 0, 1)); // 1-Jan placeholder
    if (n % 60 === 1) row.shoe_size = 0; // invalid size
    if (n % 80 === 2) row.date_of_joining = "0202-08-01"; // corrupted year
    if (n % 90 === 3) row.father_full_name = "father"; // placeholder
    if (n % 100 === 4) row.mobile_number = 9876543210; // plaintext number must never be stored
    if (n % 120 === 5) row.date_of_birth = "1882-04-26 00:00:00.000"; // unparseable/out of range
    if (n % 110 === 6) row.gender = gender === "M" ? "F" : "M"; // KIT id gender mismatch
    if (n % 130 === 7) row.type_of_athelete = "NULL";
    if (n % 140 === 8) row.date_of_joining = new Date(Date.UTC(birthYear - 1, 5, 5)); // joined before birth
    if (n % 150 === 9) row.full_name = null; // missing name
    if (n % 70 === 10) row.tshirt_size = 36; // numeric t-shirt size (invalid)
    if (n % 200 === 11) row.athlete_kitd_id = kitId.toLowerCase(); // lower-case id gets normalised
    if (n % 170 === 12)
      Object.assign(row, {
        role_detail_id: "NULL",
        academy_role: "NULL",
        academy_detail_id: "NULL",
        academy_kitd_id: "NULL",
        academy_name: "NULL",
        academy_is_active: "NULL",
      }); // no academy

    out.push(SYNTHETIC_HEADER.map((h) => row[h]));

    // Second enrolment row for some athletes (same athlete, other academy) and a few exact duplicates.
    if (n % 40 === 0) {
      const other = acad[(n * 7 + 3) % acad.length]!;
      const second = [...out[out.length - 1]!];
      const ix = (h: string) => SYNTHETIC_HEADER.indexOf(h as (typeof SYNTHETIC_HEADER)[number]);
      second[ix("role_detail_id")] = other.roleId;
      second[ix("academy_role")] = other.roleLabel;
      second[ix("academy_detail_id")] = other.id;
      second[ix("academy_kitd_id")] = other.code;
      second[ix("academy_name")] = other.name;
      second[ix("academy_is_active")] = other.active;
      out.push(second);
    }
    if (n % 97 === 0) out.push([...out[out.length - 1]!]);
  }
  return out;
}
