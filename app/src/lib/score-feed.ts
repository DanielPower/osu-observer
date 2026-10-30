import { v2 } from "osu-api-extended";
import { and, asc, eq, gte, inArray, lt, notExists, sql } from "drizzle-orm";
import { db } from "../db";
import { beatmapInfo, feedScore, scoreFeedState, speedrunPlay, user } from "../db/schema";
import { ensureOsuAuth } from "./osu-api";
import {
  type Tx,
  backfillSpeedruns,
  finalizeEndedSpeedruns,
  oldestLiveSpeedrunStart,
  recordSpeedrunScores,
} from "./speedruns";

const POLL_INTERVAL_MS = 5000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
const LOOKUP_BATCH_SIZE = 50;
const STATE_ID = 1;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 5000;

type FeedPage = Awaited<ReturnType<typeof fetchFeedPage>>;
type FeedScore = FeedPage["scores"][number];

const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

async function fetchFeedPage(cursorString: string | null) {
  const result = await v2.scores.list({
    type: "latest_ranked",
    mode: "osu",
    cursor_string: cursorString ?? undefined,
  });
  if (result.error) throw result.error;
  return result;
}

function loadState() {
  return db.query.scoreFeedState.findFirst({ where: eq(scoreFeedState.id, STATE_ID) });
}

async function saveState(state: Partial<typeof scoreFeedState.$inferInsert>) {
  await db
    .insert(scoreFeedState)
    .values({ id: STATE_ID, ...state })
    .onConflictDoUpdate({ target: scoreFeedState.id, set: { ...state, updatedAt: new Date() } });
}

async function storeMissingUsers(ids: number[]) {
  if (ids.length === 0) return;
  const known = await db.select({ id: user.id }).from(user).where(inArray(user.id, ids));
  const knownIds = new Set(known.map((row) => row.id));
  const missing = ids.filter((id) => !knownIds.has(id));
  for (const batch of chunk(missing, LOOKUP_BATCH_SIZE)) {
    // Sequential so a burst of new players doesn't fire parallel requests at osu!.
    // oxlint-disable-next-line no-await-in-loop
    const users = await v2.users.lookup({ ids: batch });
    if (users.error) throw users.error;
    if (users.length === 0) continue;
    // oxlint-disable-next-line no-await-in-loop
    await db
      .insert(user)
      .values(users.map((u) => ({ id: u.id, username: u.username, avatarUrl: u.avatar_url })))
      .onConflictDoUpdate({
        target: user.id,
        set: { username: sql`excluded.username`, avatarUrl: sql`excluded.avatar_url` },
      });
  }
}

async function storeMissingBeatmaps(ids: number[]) {
  if (ids.length === 0) return;
  const known = await db
    .select({ id: beatmapInfo.id })
    .from(beatmapInfo)
    .where(inArray(beatmapInfo.id, ids));
  const knownIds = new Set(known.map((row) => row.id));
  const missing = ids.filter((id) => !knownIds.has(id));
  for (const batch of chunk(missing, LOOKUP_BATCH_SIZE)) {
    // oxlint-disable-next-line no-await-in-loop
    const beatmaps = await v2.beatmaps.lookup({ type: "difficulties", ids: batch });
    if (beatmaps.error) throw beatmaps.error;
    if (beatmaps.length === 0) continue;
    // oxlint-disable-next-line no-await-in-loop
    await db
      .insert(beatmapInfo)
      .values(
        beatmaps.map((b) => ({
          id: b.id,
          beatmapSetId: b.beatmapset_id,
          title: b.beatmapset.title,
          artist: b.beatmapset.artist,
          version: b.version,
          creator: b.beatmapset.creator,
          difficultyRating: b.difficulty_rating,
        })),
      )
      .onConflictDoNothing();
  }
}

async function storeScores(tx: Tx, scores: FeedScore[]) {
  const inserted = [];
  for (const batch of chunk(scores, 500)) {
    // oxlint-disable-next-line no-await-in-loop
    const rows = await tx
      .insert(feedScore)
      .values(
        batch.map((s) => ({
          id: s.id,
          userId: s.user_id,
          beatmapId: s.beatmap_id,
          totalScore: s.total_score,
          accuracy: s.accuracy,
          pp: s.pp,
          maxCombo: s.max_combo,
          rank: s.rank,
          mods: s.mods.map((mod) => mod.acronym),
          endedAt: new Date(s.ended_at),
        })),
      )
      .onConflictDoNothing()
      .returning({
        id: feedScore.id,
        userId: feedScore.userId,
        beatmapId: feedScore.beatmapId,
        pp: feedScore.pp,
        endedAt: feedScore.endedAt,
      });
    inserted.push(...rows);
  }
  return inserted;
}

async function storeAndRecord(scores: FeedScore[]) {
  await db.transaction(async (tx) => {
    // Only newly stored scores count towards speedruns, so a retried page is never counted twice.
    const inserted = await storeScores(tx, scores);
    const userIds = [...new Set(inserted.map((s) => s.userId))];
    if (userIds.length === 0) return;
    // Players the user lookup couldn't find (restricted accounts) can't be shown on a leaderboard.
    const known = await tx.select({ id: user.id }).from(user).where(inArray(user.id, userIds));
    const knownIds = new Set(known.map((row) => row.id));
    await recordSpeedrunScores(
      tx,
      inserted.flatMap((s) =>
        s.pp !== null && knownIds.has(s.userId) ? [{ ...s, pp: s.pp }] : [],
      ),
    );
  });
}

export async function syncScoreFeedPage(cursorString: string | null) {
  let page: FeedPage;
  try {
    page = await fetchFeedPage(cursorString);
  } catch (error) {
    // osu! rejects (HTTP 422) a cursor that has fallen out of the feed's retention window.
    if (cursorString && /422|cursor/i.test(String(error))) {
      console.warn("[score-feed] cursor expired, restarting from the newest scores");
      return { cursorString: null, latestEndedAt: null };
    }
    throw error;
  }

  // Only lazer scores with a replay can be simulated; stable scores carry a legacy_score_id.
  const scores = page.scores.filter(
    (s) => s.ruleset_id === 0 && s.has_replay && s.legacy_score_id === null,
  );
  // Metadata is stored before the scores and the cursor so a failed lookup retries the whole page.
  await storeMissingUsers([...new Set(scores.map((s) => s.user_id))]);
  await storeMissingBeatmaps([...new Set(scores.map((s) => s.beatmap_id))]);
  await storeAndRecord(scores);
  const endedAts = page.scores.map((s) => new Date(s.ended_at).getTime());
  return {
    cursorString: page.cursor_string,
    latestEndedAt: endedAts.length > 0 ? new Date(Math.max(...endedAts)) : null,
  };
}

export function startScoreFeed() {
  let cursorString: string | null | undefined;
  let latestEndedAt: Date | null = null;
  let delay = POLL_INTERVAL_MS;

  const tick = async () => {
    try {
      await ensureOsuAuth();
      if (cursorString === undefined) {
        const state = await loadState();
        latestEndedAt = state?.latestEndedAt ?? null;
        await backfillSpeedruns();
        cursorString = state?.cursorString ?? null;
        console.log(`[score-feed] started from ${cursorString ? "saved cursor" : "newest scores"}`);
      }
      const page = await syncScoreFeedPage(cursorString);
      const pageEndedAt = page.latestEndedAt;
      const advanced = pageEndedAt !== null && (!latestEndedAt || pageEndedAt > latestEndedAt);
      if (page.cursorString !== cursorString || advanced) {
        cursorString = page.cursorString;
        if (advanced) latestEndedAt = pageEndedAt;
        await saveState({ cursorString, latestEndedAt });
      }
      // Runs here rather than on its own timer so it never interleaves with storing a page.
      await finalizeEndedSpeedruns(latestEndedAt);
      delay = POLL_INTERVAL_MS;
    } catch (error) {
      delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
      console.error(`[score-feed] sync failed, retrying in ${delay / 1000}s`, error);
    }
    setTimeout(tick, delay);
  };

  void tick();
}

async function firstScoreEndedSince(time: Date, fromId: number) {
  const [first] = await db
    .select({ id: feedScore.id })
    .from(feedScore)
    .where(and(gte(feedScore.id, fromId), gte(feedScore.endedAt, time)))
    .orderBy(asc(feedScore.id))
    .limit(1);
  return first?.id ?? null;
}

async function deleteExpiredScores() {
  const cutoff = new Date(Date.now() - RETENTION_MS);
  // Read before deleting: a speedrun finalized during the run may release scores below its start.
  const oldestLive = await oldestLiveSpeedrunStart();
  const lowWater = (await loadState())?.cleanupLowWater ?? 0;
  // Score ids grow with time, so the first fresh score bounds the expired ones and the deletes
  // become cheap primary key range scans instead of repeated scans over every fresh row.
  const firstFresh = await firstScoreEndedSince(cutoff, lowWater);
  const expired = (from: number) =>
    and(
      gte(feedScore.id, from),
      firstFresh === null ? lt(feedScore.endedAt, cutoff) : lt(feedScore.id, firstFresh),
      // Scores on a speedrun leaderboard, live or past, are kept.
      notExists(db.select().from(speedrunPlay).where(eq(speedrunPlay.scoreId, feedScore.id))),
    );

  let deleted = 0;
  // Each batch starts after the last one, so the kept scores of a live monthly speedrun are
  // walked past once per run rather than once per batch.
  let from = lowWater;
  for (;;) {
    // Small batches keep each delete's locks and WAL short instead of one large spike.
    // oxlint-disable-next-line no-await-in-loop
    const batch = await db
      .delete(feedScore)
      .where(
        inArray(
          feedScore.id,
          db
            .select({ id: feedScore.id })
            .from(feedScore)
            .where(expired(from))
            .orderBy(asc(feedScore.id))
            .limit(CLEANUP_BATCH_SIZE),
        ),
      )
      .returning({ id: feedScore.id });
    deleted += batch.length;
    if (batch.length < CLEANUP_BATCH_SIZE) break;
    from = Math.max(...batch.map((row) => row.id)) + 1;
  }
  if (deleted > 0) console.log(`[score-feed] deleted ${deleted} scores older than 7 days`);

  // Everything below the next low water mark is now deleted or held by a finalized speedrun,
  // so later runs can skip past the kept scores instead of rescanning them every hour.
  const keepFrom = oldestLive && oldestLive < cutoff ? oldestLive : cutoff;
  const nextLowWater = await firstScoreEndedSince(keepFrom, lowWater);
  if (nextLowWater !== null && nextLowWater > lowWater) {
    await saveState({ cleanupLowWater: nextLowWater });
  }
}

export function startScoreFeedCleanup() {
  const run = async () => {
    try {
      await deleteExpiredScores();
    } catch (error) {
      console.error("[score-feed] cleanup failed", error);
    }
    setTimeout(run, CLEANUP_INTERVAL_MS);
  };

  void run();
}
