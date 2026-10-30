import { v2 } from "osu-api-extended";
import { asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { beatmapInfo, feedScore, scoreFeedState, user } from "../db/schema";
import { ensureOsuAuth } from "./osu-api";

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

async function loadCursor() {
  const state = await db.query.scoreFeedState.findFirst({
    where: eq(scoreFeedState.id, STATE_ID),
  });
  return state?.cursorString ?? null;
}

async function saveCursor(cursorString: string | null) {
  await db
    .insert(scoreFeedState)
    .values({ id: STATE_ID, cursorString })
    .onConflictDoUpdate({
      target: scoreFeedState.id,
      set: { cursorString, updatedAt: new Date() },
    });
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

async function storeScores(scores: FeedScore[]) {
  await Promise.all(
    chunk(scores, 500).map((batch) =>
      db
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
        .onConflictDoNothing(),
    ),
  );
}

export async function syncScoreFeedPage(cursorString: string | null) {
  let page: FeedPage;
  try {
    page = await fetchFeedPage(cursorString);
  } catch (error) {
    // osu! rejects (HTTP 422) a cursor that has fallen out of the feed's retention window.
    if (cursorString && /422|cursor/i.test(String(error))) {
      console.warn("[score-feed] cursor expired, restarting from the newest scores");
      return null;
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
  await storeScores(scores);
  return page.cursor_string;
}

export function startScoreFeed() {
  let cursorString: string | null | undefined;
  let delay = POLL_INTERVAL_MS;

  const tick = async () => {
    try {
      await ensureOsuAuth();
      if (cursorString === undefined) {
        cursorString = await loadCursor();
        console.log(`[score-feed] started from ${cursorString ? "saved cursor" : "newest scores"}`);
      }
      const nextCursor = await syncScoreFeedPage(cursorString);
      if (nextCursor !== cursorString) {
        cursorString = nextCursor;
        await saveCursor(cursorString);
      }
      delay = POLL_INTERVAL_MS;
    } catch (error) {
      delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
      console.error(`[score-feed] sync failed, retrying in ${delay / 1000}s`, error);
    }
    setTimeout(tick, delay);
  };

  void tick();
}

async function deleteExpiredScores() {
  const cutoff = new Date(Date.now() - RETENTION_MS);
  // Score ids grow with time, so the first fresh score bounds the expired ones and the deletes
  // become cheap primary key range scans instead of repeated scans over every fresh row.
  const [firstFresh] = await db
    .select({ id: feedScore.id })
    .from(feedScore)
    .where(gte(feedScore.endedAt, cutoff))
    .orderBy(asc(feedScore.id))
    .limit(1);
  const expired = firstFresh ? lt(feedScore.id, firstFresh.id) : lt(feedScore.endedAt, cutoff);

  let deleted = 0;
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
            .where(expired)
            .orderBy(asc(feedScore.id))
            .limit(CLEANUP_BATCH_SIZE),
        ),
      )
      .returning({ id: feedScore.id });
    deleted += batch.length;
    if (batch.length < CLEANUP_BATCH_SIZE) break;
  }
  if (deleted > 0) console.log(`[score-feed] deleted ${deleted} scores older than 7 days`);
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
