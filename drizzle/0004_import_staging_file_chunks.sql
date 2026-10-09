CREATE TABLE "import_stage_chunks" (
	"stage_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"size" integer NOT NULL,
	CONSTRAINT "import_stage_chunks_stage_id_seq_pk" PRIMARY KEY("stage_id","seq")
);
--> statement-breakpoint
ALTER TABLE "import_stages" ADD COLUMN "file_bytes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "import_stage_chunks" ADD CONSTRAINT "import_stage_chunks_stage_id_import_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."import_stages"("id") ON DELETE cascade ON UPDATE no action;