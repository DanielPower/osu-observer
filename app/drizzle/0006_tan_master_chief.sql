CREATE TYPE "public"."speedrun_kind" AS ENUM('hourly', 'daily', 'weekly');--> statement-breakpoint
CREATE TABLE "speedrun" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "speedrun_kind" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"player_count" integer,
	CONSTRAINT "speedrun_kind_starts_at_unique" UNIQUE("kind","starts_at")
);
--> statement-breakpoint
CREATE TABLE "speedrun_entry" (
	"speedrun_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"total_pp" double precision NOT NULL,
	"play_count" integer NOT NULL,
	"reached_at" timestamp with time zone NOT NULL,
	"rank" integer,
	CONSTRAINT "speedrun_entry_speedrun_id_user_id_pk" PRIMARY KEY("speedrun_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "speedrun_play" (
	"speedrun_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"beatmap_id" integer NOT NULL,
	"score_id" bigint NOT NULL,
	"pp" real NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	CONSTRAINT "speedrun_play_speedrun_id_user_id_beatmap_id_pk" PRIMARY KEY("speedrun_id","user_id","beatmap_id")
);
--> statement-breakpoint
CREATE TABLE "speedrun_replay" (
	"score_id" bigint PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "score_feed_state" ADD COLUMN "latest_ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "score_feed_state" ADD COLUMN "cleanup_low_water" bigint;--> statement-breakpoint
ALTER TABLE "speedrun_entry" ADD CONSTRAINT "speedrun_entry_speedrun_id_speedrun_id_fk" FOREIGN KEY ("speedrun_id") REFERENCES "public"."speedrun"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speedrun_entry" ADD CONSTRAINT "speedrun_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speedrun_play" ADD CONSTRAINT "speedrun_play_score_id_feed_score_id_fk" FOREIGN KEY ("score_id") REFERENCES "public"."feed_score"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speedrun_play" ADD CONSTRAINT "speedrun_play_speedrun_id_user_id_speedrun_entry_speedrun_id_user_id_fk" FOREIGN KEY ("speedrun_id","user_id") REFERENCES "public"."speedrun_entry"("speedrun_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "speedrun_entry_standings_idx" ON "speedrun_entry" USING btree ("speedrun_id","total_pp" DESC NULLS LAST,"reached_at");--> statement-breakpoint
CREATE INDEX "speedrun_play_score_id_idx" ON "speedrun_play" USING btree ("score_id");--> statement-breakpoint
CREATE INDEX "speedrun_replay_next_attempt_at_idx" ON "speedrun_replay" USING btree ("next_attempt_at");