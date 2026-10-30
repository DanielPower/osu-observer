-- Hourly speedruns were replaced by monthly ones; their entries and plays cascade.
DELETE FROM "speedrun" WHERE "kind" = 'hourly';--> statement-breakpoint
ALTER TABLE "speedrun" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."speedrun_kind";--> statement-breakpoint
CREATE TYPE "public"."speedrun_kind" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
ALTER TABLE "speedrun" ALTER COLUMN "kind" SET DATA TYPE "public"."speedrun_kind" USING "kind"::"public"."speedrun_kind";--> statement-breakpoint
ALTER TABLE "score" DROP COLUMN "simulation";--> statement-breakpoint
ALTER TABLE "score" DROP COLUMN "simulation_version";