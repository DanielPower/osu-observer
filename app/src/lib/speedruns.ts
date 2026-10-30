import { type SQL, and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { speedrun } from "../db/schema";
import { SPEEDRUN_KINDS, type SpeedrunKind, speedrunWindow } from "./speedrun-periods";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SpeedrunScore = {
  id: number;
  userId: number;
  beatmapId: number;
  pp: number;
  endedAt: Date;
};

const TOP_KEPT = 10;
// Feed scores trail ended_at by pp processing, so a speedrun stays open a little past its end.
const FINALIZE_GRACE_MS = 5 * 60 * 1000;
// The feed must have delivered a score this far past the end before standings are frozen.
const FEED_CAUGHT_UP_MS = 60 * 1000;

const pairKey = (speedrunId: number, userId: number) => `${speedrunId}:${userId}`;

async function recomputeTotals(tx: Tx, playFilter: SQL) {
  await tx.execute(sql`
    UPDATE speedrun_entry e
    SET total_pp = t.total, play_count = t.plays, reached_at = t.reached
    FROM (
      SELECT speedrun_id, user_id,
             SUM(pp * power(0.95, rn - 1)) AS total, COUNT(*)::int AS plays, MAX(ended_at) AS reached
      FROM (
        SELECT p.speedrun_id, p.user_id, p.pp, p.ended_at,
               ROW_NUMBER() OVER (PARTITION BY p.speedrun_id, p.user_id ORDER BY p.pp DESC) AS rn
        FROM speedrun_play p
        ${playFilter}
      ) ranked
      GROUP BY speedrun_id, user_id
    ) t
    WHERE e.speedrun_id = t.speedrun_id AND e.user_id = t.user_id
  `);
}

function onlyPairs(pairs: { speedrunId: number; userId: number }[]) {
  const speedrunIds = sql.join(
    pairs.map((p) => sql`${p.speedrunId}`),
    sql`, `,
  );
  const userIds = sql.join(
    pairs.map((p) => sql`${p.userId}`),
    sql`, `,
  );
  return sql`
    JOIN unnest(ARRAY[${speedrunIds}]::int[], ARRAY[${userIds}]::int[]) AS touched(speedrun_id, user_id)
      ON touched.speedrun_id = p.speedrun_id AND touched.user_id = p.user_id
  `;
}

function ensureSpeedruns(tx: Tx, windows: { kind: SpeedrunKind; startsAt: Date; endsAt: Date }[]) {
  // The no-op update makes RETURNING include rows that already existed.
  return tx
    .insert(speedrun)
    .values(windows)
    .onConflictDoUpdate({
      target: [speedrun.kind, speedrun.startsAt],
      set: { kind: sql`excluded.kind` },
    })
    .returning({
      id: speedrun.id,
      kind: speedrun.kind,
      startsAt: speedrun.startsAt,
      finalizedAt: speedrun.finalizedAt,
    });
}

export async function recordSpeedrunScores(tx: Tx, scores: SpeedrunScore[]) {
  const counted = scores.filter((s) => s.pp > 0);
  if (counted.length === 0) return;

  const windows = new Map<string, { kind: SpeedrunKind; startsAt: Date; endsAt: Date }>();
  for (const s of counted) {
    for (const kind of SPEEDRUN_KINDS) {
      const window = speedrunWindow(kind, s.endedAt);
      windows.set(`${kind}:${window.startsAt.getTime()}`, { kind, ...window });
    }
  }
  const runs = await ensureSpeedruns(tx, [...windows.values()]);
  const runByWindow = new Map(runs.map((r) => [`${r.kind}:${r.startsAt.getTime()}`, r]));

  // One statement can't upsert the same row twice, so keep each player's best per map up front.
  const plays = new Map<
    string,
    { speedrunId: number; userId: number; beatmapId: number; score: SpeedrunScore }
  >();
  let late = 0;
  for (const s of counted) {
    for (const kind of SPEEDRUN_KINDS) {
      const run = runByWindow.get(`${kind}:${speedrunWindow(kind, s.endedAt).startsAt.getTime()}`)!;
      if (run.finalizedAt) {
        late++;
        continue;
      }
      const key = `${run.id}:${s.userId}:${s.beatmapId}`;
      const existing = plays.get(key);
      if (!existing || s.pp > existing.score.pp) {
        plays.set(key, { speedrunId: run.id, userId: s.userId, beatmapId: s.beatmapId, score: s });
      }
    }
  }
  if (late > 0) console.warn(`[speedruns] ignored ${late} late plays for finalized speedruns`);
  if (plays.size === 0) return;

  const rows = [...plays.values()];
  const pairs = new Map<string, { speedrunId: number; userId: number; endedAt: Date }>();
  for (const r of rows) {
    pairs.set(pairKey(r.speedrunId, r.userId), {
      speedrunId: r.speedrunId,
      userId: r.userId,
      endedAt: r.score.endedAt,
    });
  }

  await tx.execute(sql`
    INSERT INTO speedrun_entry (speedrun_id, user_id, total_pp, play_count, reached_at)
    VALUES ${sql.join(
      [...pairs.values()].map(
        (p) => sql`(${p.speedrunId}, ${p.userId}, 0, 0, ${p.endedAt.toISOString()}::timestamptz)`,
      ),
      sql`, `,
    )}
    ON CONFLICT DO NOTHING
  `);

  const improved = await tx.execute<{ speedrun_id: number; user_id: number }>(sql`
    INSERT INTO speedrun_play (speedrun_id, user_id, beatmap_id, score_id, pp, ended_at)
    VALUES ${sql.join(
      rows.map(
        (r) =>
          sql`(${r.speedrunId}, ${r.userId}, ${r.beatmapId}, ${r.score.id}, ${r.score.pp}, ${r.score.endedAt.toISOString()}::timestamptz)`,
      ),
      sql`, `,
    )}
    ON CONFLICT (speedrun_id, user_id, beatmap_id) DO UPDATE
      SET score_id = excluded.score_id, pp = excluded.pp, ended_at = excluded.ended_at
      WHERE excluded.pp > speedrun_play.pp
    RETURNING speedrun_id, user_id
  `);

  const touched = new Map(
    improved.map((r) => [
      pairKey(r.speedrun_id, r.user_id),
      { speedrunId: r.speedrun_id, userId: r.user_id },
    ]),
  );
  if (touched.size > 0) await recomputeTotals(tx, onlyPairs([...touched.values()]));
}

async function finalizeSpeedrun(tx: Tx, speedrunId: number) {
  await tx.execute(sql`
    UPDATE speedrun_entry e
    SET rank = r.rn
    FROM (
      SELECT user_id, ROW_NUMBER() OVER (ORDER BY total_pp DESC, reached_at, user_id) AS rn
      FROM speedrun_entry
      WHERE speedrun_id = ${speedrunId}
    ) r
    WHERE e.speedrun_id = ${speedrunId} AND e.user_id = r.user_id AND r.rn <= ${TOP_KEPT}
  `);
  await tx.execute(sql`
    UPDATE speedrun
    SET player_count = (SELECT COUNT(*) FROM speedrun_entry WHERE speedrun_id = ${speedrunId})
    WHERE id = ${speedrunId}
  `);
  await tx.execute(
    sql`DELETE FROM speedrun_entry WHERE speedrun_id = ${speedrunId} AND rank IS NULL`,
  );
  // Watched scores are already stored; the rest are queued so the top 10 stay watchable.
  await tx.execute(sql`
    INSERT INTO speedrun_replay (score_id)
    SELECT p.score_id FROM speedrun_play p
    WHERE p.speedrun_id = ${speedrunId}
      AND NOT EXISTS (SELECT 1 FROM score s WHERE s.id = p.score_id::text)
    ON CONFLICT DO NOTHING
  `);
  await tx.update(speedrun).set({ finalizedAt: new Date() }).where(eq(speedrun.id, speedrunId));
}

export async function finalizeEndedSpeedruns(latestEndedAt: Date | null) {
  if (!latestEndedAt) return;
  const due = new Date(
    Math.min(Date.now() - FINALIZE_GRACE_MS, latestEndedAt.getTime() - FEED_CAUGHT_UP_MS),
  );
  const ended = await db
    .select({ id: speedrun.id, kind: speedrun.kind, startsAt: speedrun.startsAt })
    .from(speedrun)
    .where(and(isNull(speedrun.finalizedAt), lte(speedrun.endsAt, due)))
    .orderBy(asc(speedrun.endsAt));
  for (const run of ended) {
    // oxlint-disable-next-line no-await-in-loop
    await db.transaction((tx) => finalizeSpeedrun(tx, run.id));
    console.log(`[speedruns] finalized ${run.kind} speedrun from ${run.startsAt.toISOString()}`);
  }
}

const TRUNC_UNIT = { hourly: "hour", daily: "day", weekly: "week" } as const;
const LENGTH = { hourly: "1 hour", daily: "1 day", weekly: "7 days" } as const;

// Rebuilds every speedrun covered by the stored feed. Only needed on a database that has never
// tracked speedruns; after that, ingest keeps them up to date.
export async function backfillSpeedruns() {
  const [existing] = await db.select({ id: speedrun.id }).from(speedrun).limit(1);
  if (existing) return;

  await db.transaction(async (tx) => {
    for (const kind of SPEEDRUN_KINDS) {
      const unit = sql.raw(`'${TRUNC_UNIT[kind]}'`);
      const length = sql.raw(`'${LENGTH[kind]}'`);
      // date_trunc on 'week' starts weeks on Monday, matching speedrunStart.
      const startsAt = sql`date_trunc(${unit}, f.ended_at, 'UTC')`;
      const scored = sql`
        FROM feed_score f
        JOIN "user" u ON u.id = f.user_id
        JOIN speedrun s ON s.kind = ${kind} AND s.starts_at = ${startsAt}
        WHERE f.pp > 0
      `;
      // oxlint-disable-next-line no-await-in-loop
      await tx.execute(sql`
        INSERT INTO speedrun (kind, starts_at, ends_at)
        SELECT DISTINCT ${kind}::speedrun_kind, ${startsAt}, ${startsAt} + interval ${length}
        FROM feed_score f
        WHERE f.pp > 0
        ON CONFLICT DO NOTHING
      `);
      // oxlint-disable-next-line no-await-in-loop
      await tx.execute(sql`
        INSERT INTO speedrun_entry (speedrun_id, user_id, total_pp, play_count, reached_at)
        SELECT DISTINCT s.id, f.user_id, 0::float8, 0, s.starts_at ${scored}
      `);
      // oxlint-disable-next-line no-await-in-loop
      await tx.execute(sql`
        INSERT INTO speedrun_play (speedrun_id, user_id, beatmap_id, score_id, pp, ended_at)
        SELECT DISTINCT ON (s.id, f.user_id, f.beatmap_id)
               s.id, f.user_id, f.beatmap_id, f.id, f.pp, f.ended_at
        ${scored}
        ORDER BY s.id, f.user_id, f.beatmap_id, f.pp DESC
      `);
    }
    await recomputeTotals(tx, sql``);
  });
  console.log("[speedruns] backfilled speedruns from stored feed scores");
}

export async function oldestLiveSpeedrunStart() {
  const [oldest] = await db
    .select({ startsAt: speedrun.startsAt })
    .from(speedrun)
    .where(isNull(speedrun.finalizedAt))
    .orderBy(asc(speedrun.startsAt))
    .limit(1);
  return oldest?.startsAt ?? null;
}
