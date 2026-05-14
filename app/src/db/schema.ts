import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  date,
  index,
  primaryKey,
  json,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: integer("id").primaryKey(),
  username: text("username").notNull(),
  avatarUrl: text("avatar_url").notNull(),
});

export const comment = pgTable("comment", {
  id: serial("id").primaryKey(),
  scoreId: text("score_id").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => user.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const beatmap = pgTable("beatmap", {
  md5: text("md5").primaryKey(),
  beatmapSetId: integer("beatmap_set_id").notNull(),
  title: text("title").notNull(),
  version: text("version").notNull(),
  artist: text("artist").notNull(),
  creator: text("creator").notNull(),
  beatmapFilename: text("beatmap_filename").notNull(),
  bgFilename: text("bg_filename"),
});

export const score = pgTable("score", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => user.id),
  beatmapMd5: text("beatmap_md5")
    .notNull()
    .references(() => beatmap.md5),
  simulation: json().notNull(),
  mods: integer().notNull(),
});

export const scoreView = pgTable(
  "score_view",
  {
    scoreId: text("score_id").notNull(),
    viewerKey: text("viewer_key").notNull(),
    day: date("day").notNull(),
    viewedAt: timestamp("viewed_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.scoreId, t.viewerKey, t.day] }),
    index("score_views_day_idx").on(t.day),
  ],
);
