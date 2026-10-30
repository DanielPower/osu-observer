CREATE TABLE "beatmap_info" (
	"id" integer PRIMARY KEY NOT NULL,
	"beatmap_set_id" integer NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"version" text NOT NULL,
	"creator" text NOT NULL,
	"difficulty_rating" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_score" (
	"id" bigint PRIMARY KEY NOT NULL,
	"legacy_score_id" bigint,
	"user_id" integer NOT NULL,
	"beatmap_id" integer NOT NULL,
	"rank" text NOT NULL,
	"accuracy" real NOT NULL,
	"pp" real,
	"total_score" integer NOT NULL,
	"max_combo" integer NOT NULL,
	"mods" jsonb NOT NULL,
	"has_replay" boolean NOT NULL,
	"ended_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_feed_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"cursor_string" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feed_score_replay_idx" ON "feed_score" USING btree ("id" DESC NULLS LAST) WHERE "feed_score"."has_replay";