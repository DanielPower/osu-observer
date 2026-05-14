CREATE TABLE "beatmap" (
	"md5" text PRIMARY KEY NOT NULL,
	"beatmap_set_id" integer NOT NULL,
	"title" text NOT NULL,
	"version" text NOT NULL,
	"artist" text NOT NULL,
	"creator" text NOT NULL,
	"beatmap_filename" text NOT NULL,
	"bg_filename" text,
	"bg_color" text
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" serial PRIMARY KEY NOT NULL,
	"score_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"beatmap_md5" text NOT NULL,
	"simulation" json NOT NULL,
	"mods" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_view" (
	"score_id" text NOT NULL,
	"viewer_key" text NOT NULL,
	"day" date NOT NULL,
	"viewed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "score_view_score_id_viewer_key_day_pk" PRIMARY KEY("score_id","viewer_key","day")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" integer PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"avatar_url" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_beatmap_md5_beatmap_md5_fk" FOREIGN KEY ("beatmap_md5") REFERENCES "public"."beatmap"("md5") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "score_views_day_idx" ON "score_view" USING btree ("day");