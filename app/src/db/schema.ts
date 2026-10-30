import {
  pgTable,
  serial,
  text,
  integer,
  bigint,
  real,
  timestamp,
  date,
  index,
  primaryKey,
  foreignKey,
  unique,
  pgEnum,
  doublePrecision,
  json,
  jsonb,
} from "drizzle-orm/pg-core";
import type { LazerMod } from "osu-simulation";

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
  beatmapId: integer("beatmap_id"),
  beatmapSetId: integer("beatmap_set_id").notNull(),
  title: text("title").notNull(),
  version: text("version").notNull(),
  artist: text("artist").notNull(),
  creator: text("creator").notNull(),
  beatmapFilename: text("beatmap_filename").notNull(),
  bgFilename: text("bg_filename"),
  bgColor: text("bg_color"),
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
  simulationVersion: integer("simulation_version").notNull().default(0),
  mods: integer().notNull(),
  // The score's lazer mods with settings, from the osu! API. Null for scores
  // stored before this column existed.
  lazerMods: jsonb("lazer_mods").$type<LazerMod[]>(),
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

export const feedScore = pgTable(
  "feed_score",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    userId: integer("user_id").notNull(),
    beatmapId: integer("beatmap_id").notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    totalScore: integer("total_score").notNull(),
    accuracy: real("accuracy").notNull(),
    pp: real("pp"),
    maxCombo: integer("max_combo").notNull(),
    rank: text("rank").notNull(),
    mods: text("mods").array().notNull(),
  },
  // Finding every play a speedrun's top 10 set during it, to download their replays.
  (t) => [index("feed_score_user_ended_at_idx").on(t.userId, t.endedAt)],
);

export const beatmapInfo = pgTable("beatmap_info", {
  id: integer("id").primaryKey(),
  beatmapSetId: integer("beatmap_set_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  version: text("version").notNull(),
  creator: text("creator").notNull(),
  difficultyRating: real("difficulty_rating").notNull(),
});

export const scoreFeedState = pgTable("score_feed_state", {
  id: integer("id").primaryKey(),
  cursorString: text("cursor_string"),
  // Newest ended_at the feed has delivered, so speedruns are only finalized once the feed has caught up.
  latestEndedAt: timestamp("latest_ended_at", { withTimezone: true }),
  // Every feed_score below this id is either deleted or kept for good by a finalized speedrun.
  cleanupLowWater: bigint("cleanup_low_water", { mode: "number" }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const speedrunKind = pgEnum("speedrun_kind", ["hourly", "daily", "weekly"]);

export const speedrun = pgTable(
  "speedrun",
  {
    id: serial("id").primaryKey(),
    kind: speedrunKind("kind").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    // Set at finalization, since only the top 10 entries are kept.
    playerCount: integer("player_count"),
  },
  (t) => [unique("speedrun_kind_starts_at_unique").on(t.kind, t.startsAt)],
);

export const speedrunEntry = pgTable(
  "speedrun_entry",
  {
    speedrunId: integer("speedrun_id")
      .notNull()
      .references(() => speedrun.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => user.id),
    totalPp: doublePrecision("total_pp").notNull(),
    playCount: integer("play_count").notNull(),
    reachedAt: timestamp("reached_at", { withTimezone: true }).notNull(),
    rank: integer("rank"),
  },
  (t) => [
    primaryKey({ columns: [t.speedrunId, t.userId] }),
    index("speedrun_entry_standings_idx").on(t.speedrunId, t.totalPp.desc(), t.reachedAt),
  ],
);

export const speedrunPlay = pgTable(
  "speedrun_play",
  {
    speedrunId: integer("speedrun_id").notNull(),
    userId: integer("user_id").notNull(),
    beatmapId: integer("beatmap_id").notNull(),
    // No cascade: a referenced score must never be deleted by the feed cleanup.
    scoreId: bigint("score_id", { mode: "number" })
      .notNull()
      .references(() => feedScore.id),
    pp: real("pp").notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.speedrunId, t.userId, t.beatmapId] }),
    foreignKey({
      columns: [t.speedrunId, t.userId],
      foreignColumns: [speedrunEntry.speedrunId, speedrunEntry.userId],
    }).onDelete("cascade"),
    index("speedrun_play_score_id_idx").on(t.scoreId),
  ],
);

// Replays of finalized top 10 plays still to download, before osu! deletes superseded scores.
export const speedrunReplay = pgTable(
  "speedrun_replay",
  {
    scoreId: bigint("score_id", { mode: "number" }).primaryKey(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("speedrun_replay_next_attempt_at_idx").on(t.nextAttemptAt)],
);
