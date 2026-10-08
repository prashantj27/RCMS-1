CREATE TABLE "import_stage_rows" (
	"stage_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"rows" jsonb NOT NULL,
	"row_count" integer NOT NULL,
	CONSTRAINT "import_stage_rows_stage_id_seq_pk" PRIMARY KEY("stage_id","seq")
);
--> statement-breakpoint
CREATE TABLE "import_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"row_count" integer NOT NULL,
	"header" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_stage_rows" ADD CONSTRAINT "import_stage_rows_stage_id_import_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."import_stages"("id") ON DELETE cascade ON UPDATE no action;