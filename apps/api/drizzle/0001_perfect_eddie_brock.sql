CREATE TABLE "score_metadata" (
	"score_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"beatmap_id" integer NOT NULL,
	"beatmap_set_id" integer NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"creator" text NOT NULL,
	"version" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_views" (
	"score_id" text NOT NULL,
	"viewer_key" text NOT NULL,
	"day" date NOT NULL,
	"viewed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "score_views_score_id_viewer_key_day_pk" PRIMARY KEY("score_id","viewer_key","day")
);
--> statement-breakpoint
CREATE INDEX "score_views_day_idx" ON "score_views" USING btree ("day");