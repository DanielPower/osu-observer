CREATE TABLE "beatmap" (
	"id" integer PRIMARY KEY NOT NULL,
	"beatmap_set_id" integer NOT NULL,
	"version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beatmap_set" (
	"id" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"creator" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "score_metadata" RENAME TO "score";
--> statement-breakpoint
ALTER TABLE "score" RENAME COLUMN "score_id" TO "id";
--> statement-breakpoint
ALTER TABLE "score" DROP CONSTRAINT "score_metadata_user_id_users_id_fk";
--> statement-breakpoint
INSERT INTO "beatmap_set" ("id", "title", "artist", "creator")
SELECT DISTINCT ON ("beatmap_set_id") "beatmap_set_id", "title", "artist", "creator"
FROM "score";
--> statement-breakpoint
INSERT INTO "beatmap" ("id", "beatmap_set_id", "version")
SELECT DISTINCT ON ("beatmap_id") "beatmap_id", "beatmap_set_id", "version"
FROM "score";
--> statement-breakpoint
ALTER TABLE "beatmap" ADD CONSTRAINT "beatmap_beatmap_set_id_beatmap_set_id_fk" FOREIGN KEY ("beatmap_set_id") REFERENCES "public"."beatmap_set"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_beatmap_id_beatmap_id_fk" FOREIGN KEY ("beatmap_id") REFERENCES "public"."beatmap"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "score" DROP COLUMN "username";
--> statement-breakpoint
ALTER TABLE "score" DROP COLUMN "beatmap_set_id";
--> statement-breakpoint
ALTER TABLE "score" DROP COLUMN "title";
--> statement-breakpoint
ALTER TABLE "score" DROP COLUMN "artist";
--> statement-breakpoint
ALTER TABLE "score" DROP COLUMN "creator";
--> statement-breakpoint
ALTER TABLE "score" DROP COLUMN "version";
--> statement-breakpoint
ALTER TABLE "score" DROP COLUMN "updated_at";
