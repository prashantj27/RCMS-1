import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** Centre categories (source: role_detail_id / academy_role). Ids mirror the source system. */
export const centreTypes = pgTable("centre_types", {
  id: integer("id").primaryKey(),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  operator: text("operator").notNull(),
});

export const sports = pgTable("sports", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  isPara: boolean("is_para").notNull().default(false),
});

/** Academies / centres. `id` is the source system's academy_detail_id. */
export const academies = pgTable(
  "academies",
  {
    id: integer("id").primaryKey(),
    kitCode: text("kit_code"),
    name: text("name").notNull(),
    centreTypeId: integer("centre_type_id").references(() => centreTypes.id),
    isActive: boolean("is_active").notNull().default(true),
    /** Inferred from the academy code (e.g. MSAA000UP21 → UP). Not authoritative. */
    stateCode: text("state_code"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("academies_centre_type_idx").on(t.centreTypeId),
    index("academies_state_idx").on(t.stateCode),
    index("academies_kit_code_idx").on(t.kitCode),
  ],
);

/** Athletes. `id` is the source system's player_detail_id. Contains minors' PII. */
export const athletes = pgTable(
  "athletes",
  {
    id: integer("id").primaryKey(),
    kitId: text("kit_id").notNull().unique(),
    fullName: text("full_name"),
    /** lower(full_name) – prefix/contains search without function indexes. */
    searchName: text("search_name").notNull().default(""),
    fatherName: text("father_name"),
    motherName: text("mother_name"),
    gender: char("gender", { length: 1 }).notNull(),
    dob: date("dob", { mode: "string" }),
    /** Opaque ciphertext from the source export. Never returned by any API. */
    mobileCipher: text("mobile_cipher"),
    sportId: integer("sport_id")
      .notNull()
      .references(() => sports.id),
    shoeSize: smallint("shoe_size"),
    blazerSize: text("blazer_size"),
    tshirtSize: text("tshirt_size"),
    pantSize: text("pant_size"),
    kittingUpdatedAt: timestamp("kitting_updated_at", { withTimezone: true }),
    /** Set when a person edits kit data in the app; protects it from being overwritten by re-imports. */
    editedAt: timestamp("edited_at", { withTimezone: true }),
    editedBy: uuid("edited_by"),
    lastImportBatchId: uuid("last_import_batch_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("athletes_gender_chk", sql`${t.gender} in ('M','F')`),
    index("athletes_sport_idx").on(t.sportId),
    index("athletes_search_name_idx").using("btree", sql`${t.searchName} text_pattern_ops`),
    index("athletes_dup_idx").on(t.searchName, t.dob),
  ],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    academyId: integer("academy_id")
      .notNull()
      .references(() => academies.id),
    athleteType: text("athlete_type"),
    joinedOn: date("joined_on", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("enrollments_athlete_academy_uq").on(t.athleteId, t.academyId),
    index("enrollments_academy_idx").on(t.academyId),
    check("enrollments_type_chk", sql`${t.athleteType} is null or ${t.athleteType} in ('RESIDENTIAL','NON_RESIDENTIAL')`),
  ],
);

export const dqIssues = pgTable(
  "dq_issues",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    ref: text("ref").notNull().default(""),
    ruleCode: text("rule_code").notNull(),
    severity: text("severity").notNull(),
    message: text("message").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    batchId: uuid("batch_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("dq_issues_key_uq").on(t.entityType, t.entityId, t.ruleCode, t.ref),
    index("dq_issues_rule_idx").on(t.ruleCode),
    index("dq_issues_severity_idx").on(t.severity),
    check("dq_issues_severity_chk", sql`${t.severity} in ('error','warning','info')`),
    check("dq_issues_entity_chk", sql`${t.entityType} in ('athlete','academy')`),
  ],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull().default("athlete_master"),
    mode: text("mode").notNull(),
    status: text("status").notNull(),
    fileName: text("file_name").notNull(),
    fileSha256: text("file_sha256").notNull(),
    summary: jsonb("summary").$type<Record<string, unknown>>(),
    error: text("error"),
    createdBy: uuid("created_by"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("import_batches_started_idx").on(t.startedAt),
    check("import_batches_mode_chk", sql`${t.mode} in ('dry_run','apply')`),
    check("import_batches_status_chk", sql`${t.status} in ('running','completed','failed')`),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(sql`lower(${t.email})`),
    check("users_role_chk", sql`${t.role} in ('ADMIN','HQ_OFFICER','CENTRE_USER','ANALYST')`),
  ],
);

/** Academies a CENTRE_USER may see. */
export const userAcademies = pgTable(
  "user_academies",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    academyId: integer("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.academyId] })],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id"),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    ip: text("ip"),
  },
  (t) => [index("audit_log_at_idx").on(t.at), index("audit_log_entity_idx").on(t.entityType, t.entityId)],
);

export type AthleteRow = typeof athletes.$inferSelect;
export type AcademyRow = typeof academies.$inferSelect;
export type UserRow = typeof users.$inferSelect;
