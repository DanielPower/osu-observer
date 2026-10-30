import { and, asc, count, desc, eq, gt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { beatmapInfo, feedScore, speedrun, speedrunEntry, speedrunPlay, user } from "../db/schema";
import {
  SPEEDRUN_KINDS,
  type SpeedrunKind,
  previousSpeedrunStart,
  speedrunEnd,
  speedrunKey,
  speedrunWindow,
} from "./speedrun-periods";

export type SpeedrunStanding = {
  rank: number;
  userId: number;
  username: string;
  avatarUrl: string;
  totalPp: number;
  playCount: number;
};

export type SpeedrunSummary = {
  kind: SpeedrunKind;
  key: string;
  startsAt: string;
  endsAt: string;
  live: boolean;
  playerCount: number;
};

export type SpeedrunPage = SpeedrunSummary & {
  previousKey: string;
  nextKey: string | null;
  standings: SpeedrunStanding[];
  me: (SpeedrunStanding & { gapToNext: number | null }) | null;
};

export type SpeedrunPlayRow = {
  scoreId: string;
  pp: number;
  endedAt: string;
  accuracy: number;
  rank: string;
  mods: string[];
  beatmapSetId: number;
  title: string;
  version: string;
  starRating: number;
};

const findSpeedrun = (kind: SpeedrunKind, startsAt: Date) =>
  db.query.speedrun.findFirst({
    where: and(eq(speedrun.kind, kind), eq(speedrun.startsAt, startsAt)),
  });

const standingColumns = {
  rank: speedrunEntry.rank,
  userId: speedrunEntry.userId,
  username: user.username,
  avatarUrl: user.avatarUrl,
  totalPp: speedrunEntry.totalPp,
  playCount: speedrunEntry.playCount,
};
const standingOrder = [
  desc(speedrunEntry.totalPp),
  asc(speedrunEntry.reachedAt),
  asc(speedrunEntry.userId),
];

async function standings(speedrunId: number, offset: number, limit: number) {
  const rows = await db
    .select(standingColumns)
    .from(speedrunEntry)
    .innerJoin(user, eq(user.id, speedrunEntry.userId))
    .where(eq(speedrunEntry.speedrunId, speedrunId))
    .orderBy(...standingOrder)
    .offset(offset)
    .limit(limit);
  return rows.map((row, i) => ({ ...row, rank: row.rank ?? offset + i + 1 }));
}

async function liveStandingOf(speedrunId: number, userId: number) {
  const [mine] = await db
    .select({ ...standingColumns, reachedAt: speedrunEntry.reachedAt })
    .from(speedrunEntry)
    .innerJoin(user, eq(user.id, speedrunEntry.userId))
    .where(and(eq(speedrunEntry.speedrunId, speedrunId), eq(speedrunEntry.userId, userId)));
  if (!mine) return null;
  const ahead = or(
    gt(speedrunEntry.totalPp, mine.totalPp),
    and(
      eq(speedrunEntry.totalPp, mine.totalPp),
      sql`${speedrunEntry.reachedAt} < ${mine.reachedAt.toISOString()}::timestamptz`,
    ),
  );
  const [{ value: aheadCount }] = await db
    .select({ value: count() })
    .from(speedrunEntry)
    .where(and(eq(speedrunEntry.speedrunId, speedrunId), ahead));
  const [next] = await db
    .select({ totalPp: speedrunEntry.totalPp })
    .from(speedrunEntry)
    .where(and(eq(speedrunEntry.speedrunId, speedrunId), ahead))
    .orderBy(asc(speedrunEntry.totalPp))
    .limit(1);
  const { reachedAt: _, ...standing } = mine;
  return {
    ...standing,
    rank: aheadCount + 1,
    gapToNext: next ? next.totalPp - mine.totalPp : null,
  };
}

async function playerCount(run: { id: number; playerCount: number | null }) {
  if (run.playerCount !== null) return run.playerCount;
  const [{ value }] = await db
    .select({ value: count() })
    .from(speedrunEntry)
    .where(eq(speedrunEntry.speedrunId, run.id));
  return value;
}

export function currentSpeedruns() {
  const now = new Date();
  return Promise.all(
    SPEEDRUN_KINDS.map(async (kind) => {
      const { startsAt, endsAt } = speedrunWindow(kind, now);
      const run = await findSpeedrun(kind, startsAt);
      return {
        kind,
        key: speedrunKey(kind, startsAt),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        live: true,
        playerCount: run ? await playerCount(run) : 0,
        standings: run ? await standings(run.id, 0, 3) : [],
      };
    }),
  );
}

export async function speedrunPage(
  kind: SpeedrunKind,
  startsAt: Date,
  options: { offset: number; limit: number; viewerId: number | null },
): Promise<SpeedrunPage> {
  const endsAt = speedrunEnd(kind, startsAt);
  const current = speedrunWindow(kind, new Date()).startsAt;
  const run = await findSpeedrun(kind, startsAt);
  const live = !run?.finalizedAt;
  return {
    kind,
    key: speedrunKey(kind, startsAt),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    live,
    playerCount: run ? await playerCount(run) : 0,
    previousKey: speedrunKey(kind, previousSpeedrunStart(kind, startsAt)),
    nextKey: startsAt < current ? speedrunKey(kind, endsAt) : null,
    standings: run ? await standings(run.id, options.offset, options.limit) : [],
    me: run && live && options.viewerId ? await liveStandingOf(run.id, options.viewerId) : null,
  };
}

export async function speedrunPlays(
  kind: SpeedrunKind,
  startsAt: Date,
  userId: number,
): Promise<SpeedrunPlayRow[] | null> {
  const run = await findSpeedrun(kind, startsAt);
  if (!run) return null;
  const plays = await db
    .select({
      scoreId: speedrunPlay.scoreId,
      pp: speedrunPlay.pp,
      endedAt: speedrunPlay.endedAt,
      accuracy: feedScore.accuracy,
      rank: feedScore.rank,
      mods: feedScore.mods,
      beatmapSetId: beatmapInfo.beatmapSetId,
      title: beatmapInfo.title,
      version: beatmapInfo.version,
      starRating: beatmapInfo.difficultyRating,
    })
    .from(speedrunPlay)
    .innerJoin(feedScore, eq(feedScore.id, speedrunPlay.scoreId))
    .innerJoin(beatmapInfo, eq(beatmapInfo.id, speedrunPlay.beatmapId))
    .where(and(eq(speedrunPlay.speedrunId, run.id), eq(speedrunPlay.userId, userId)))
    .orderBy(desc(speedrunPlay.pp));
  if (plays.length === 0) return null;
  return plays.map((p) => ({ ...p, scoreId: String(p.scoreId), endedAt: p.endedAt.toISOString() }));
}
