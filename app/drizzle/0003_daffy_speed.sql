-- feed_score was never deployed without these columns, so any locally synced rows are disposable.
TRUNCATE TABLE "feed_score";--> statement-breakpoint
ALTER TABLE "feed_score" ADD COLUMN "total_score" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_score" ADD COLUMN "accuracy" real NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_score" ADD COLUMN "pp" real;--> statement-breakpoint
ALTER TABLE "feed_score" ADD COLUMN "max_combo" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_score" ADD COLUMN "rank" text NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_score" ADD COLUMN "mods" text[] NOT NULL;