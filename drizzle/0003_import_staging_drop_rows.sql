DROP TABLE "import_stage_rows" CASCADE;--> statement-breakpoint
ALTER TABLE "import_stages" DROP COLUMN "row_count";--> statement-breakpoint
ALTER TABLE "import_stages" DROP COLUMN "header";