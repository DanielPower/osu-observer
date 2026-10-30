ALTER TABLE "feed_score" ADD COLUMN "total_score" integer;--> statement-breakpoint
ALTER TABLE "feed_score" ADD COLUMN "accuracy" real;--> statement-breakpoint
ALTER TABLE "feed_score" ADD COLUMN "pp" real;--> statement-breakpoint
ALTER TABLE "feed_score" ADD COLUMN "max_combo" integer;--> statement-breakpoint
ALTER TABLE "feed_score" ADD COLUMN "rank" text;--> statement-breakpoint
ALTER TABLE "feed_score" ADD COLUMN "mods" text[];