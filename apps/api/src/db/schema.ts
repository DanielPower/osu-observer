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

export const scoreMetadata = pgTable("score_metadata", {
  scoreId: text("score_id").primaryKey(),
  username: text("username").notNull(),
  userId: integer("user_id").references(() => users.id),
  beatmapId: integer("beatmap_id").notNull(),
  beatmapSetId: integer("beatmap_set_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  creator: text("creator").notNull(),
  version: text("version").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
