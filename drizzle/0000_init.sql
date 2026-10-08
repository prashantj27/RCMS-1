CREATE TABLE "academies" (
	"id" integer PRIMARY KEY NOT NULL,
	"kit_code" text,
	"name" text NOT NULL,
	"centre_type_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"state_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "athletes" (
	"id" integer PRIMARY KEY NOT NULL,
	"kit_id" text NOT NULL,
	"full_name" text,
	"search_name" text DEFAULT '' NOT NULL,
	"father_name" text,
	"mother_name" text,
	"gender" char(1) NOT NULL,
	"dob" date,
	"mobile_cipher" text,
	"sport_id" integer NOT NULL,
	"shoe_size" smallint,
	"blazer_size" text,
	"tshirt_size" text,
	"pant_size" text,
	"kitting_updated_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"edited_by" uuid,
	"last_import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athletes_kit_id_unique" UNIQUE("kit_id"),
	CONSTRAINT "athletes_gender_chk" CHECK ("athletes"."gender" in ('M','F'))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"detail" jsonb,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "centre_types" (
	"id" integer PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"operator" text NOT NULL,
	CONSTRAINT "centre_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "dq_issues" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"rule_code" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"detail" jsonb,
	"batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dq_issues_severity_chk" CHECK ("dq_issues"."severity" in ('error','warning','info')),
	CONSTRAINT "dq_issues_entity_chk" CHECK ("dq_issues"."entity_type" in ('athlete','academy'))
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"athlete_id" integer NOT NULL,
	"academy_id" integer NOT NULL,
	"athlete_type" text,
	"joined_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_athlete_academy_uq" UNIQUE("athlete_id","academy_id"),
	CONSTRAINT "enrollments_type_chk" CHECK ("enrollments"."athlete_type" is null or "enrollments"."athlete_type" in ('RESIDENTIAL','NON_RESIDENTIAL'))
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'athlete_master' NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"summary" jsonb,
	"error" text,
	"created_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "import_batches_mode_chk" CHECK ("import_batches"."mode" in ('dry_run','apply')),
	CONSTRAINT "import_batches_status_chk" CHECK ("import_batches"."status" in ('running','completed','failed'))
);
--> statement-breakpoint
CREATE TABLE "sports" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_para" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sports_name_unique" UNIQUE("name"),
	CONSTRAINT "sports_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_academies" (
	"user_id" uuid NOT NULL,
	"academy_id" integer NOT NULL,
	CONSTRAINT "user_academies_user_id_academy_id_pk" PRIMARY KEY("user_id","academy_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_chk" CHECK ("users"."role" in ('ADMIN','HQ_OFFICER','CENTRE_USER','ANALYST'))
);
--> statement-breakpoint
ALTER TABLE "academies" ADD CONSTRAINT "academies_centre_type_id_centre_types_id_fk" FOREIGN KEY ("centre_type_id") REFERENCES "public"."centre_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_academies" ADD CONSTRAINT "user_academies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_academies" ADD CONSTRAINT "user_academies_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academies_centre_type_idx" ON "academies" USING btree ("centre_type_id");--> statement-breakpoint
CREATE INDEX "academies_state_idx" ON "academies" USING btree ("state_code");--> statement-breakpoint
CREATE INDEX "academies_kit_code_idx" ON "academies" USING btree ("kit_code");--> statement-breakpoint
CREATE INDEX "athletes_sport_idx" ON "athletes" USING btree ("sport_id");--> statement-breakpoint
CREATE INDEX "athletes_search_name_idx" ON "athletes" USING btree ("search_name" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "athletes_dup_idx" ON "athletes" USING btree ("search_name","dob");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dq_issues_key_uq" ON "dq_issues" USING btree ("entity_type","entity_id","rule_code","ref");--> statement-breakpoint
CREATE INDEX "dq_issues_rule_idx" ON "dq_issues" USING btree ("rule_code");--> statement-breakpoint
CREATE INDEX "dq_issues_severity_idx" ON "dq_issues" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "enrollments_academy_idx" ON "enrollments" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "import_batches_started_idx" ON "import_batches" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));