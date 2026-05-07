import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  date,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: integer("id").primaryKey(),
  username: text("username").notNull(),
  avatarUrl: text("avatar_url").notNull(),
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  scoreId: text("score_id").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const beatmapSet = pgTable("beatmap_set", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  creator: text("creator").notNull(),
});

export const beatmap = pgTable("beatmap", {
  id: integer("id").primaryKey(),
  beatmapSetId: integer("beatmap_set_id")
    .notNull()
    .references(() => beatmapSet.id),
  version: text("version").notNull(),
});

export const score = pgTable("score", {
  id: text("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  beatmapId: integer("beatmap_id")
    .notNull()
    .references(() => beatmap.id),
});

export const scoreViews = pgTable(
  "score_views",
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
