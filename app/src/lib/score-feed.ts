import { v2 } from "osu-api-extended";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { beatmapInfo, feedScore, scoreFeedState, user } from "../db/schema";
import { ensureOsuAuth } from "./osu-api";

const POLL_INTERVAL_MS = 5000;
const FULL_PAGE_SIZE = 1000;
const LOOKUP_BATCH_SIZE = 50;
const STATE_ID = 1;

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
  await Promise.all(
    chunk(missing, LOOKUP_BATCH_SIZE).map(async (batch) => {
      const users = await v2.users.lookup({ ids: batch });
      if (users.error) throw users.error;
      if (users.length === 0) return;
      await db
        .insert(user)
        .values(users.map((u) => ({ id: u.id, username: u.username, avatarUrl: u.avatar_url })))
        .onConflictDoUpdate({
          target: user.id,
          set: { username: sql`excluded.username`, avatarUrl: sql`excluded.avatar_url` },
        });
    }),
  );
}

async function storeMissingBeatmaps(ids: number[]) {
  if (ids.length === 0) return;
  const known = await db
    .select({ id: beatmapInfo.id })
    .from(beatmapInfo)
    .where(inArray(beatmapInfo.id, ids));
  const knownIds = new Set(known.map((row) => row.id));
  const missing = ids.filter((id) => !knownIds.has(id));
  await Promise.all(
    chunk(missing, LOOKUP_BATCH_SIZE).map(async (batch) => {
      const beatmaps = await v2.beatmaps.lookup({ type: "difficulties", ids: batch });
      if (beatmaps.error) throw beatmaps.error;
      if (beatmaps.length === 0) return;
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
    }),
  );
}

async function storeScores(scores: FeedScore[]) {
  await Promise.all(
    chunk(scores, 500).map((batch) =>
      db
        .insert(feedScore)
        .values(
          batch.map((s) => ({
            id: s.id,
            legacyScoreId: s.legacy_score_id,
            userId: s.user_id,
            beatmapId: s.beatmap_id,
            rank: s.rank,
            accuracy: s.accuracy,
            pp: s.pp,
            totalScore: s.total_score,
            maxCombo: s.max_combo,
            mods: s.mods,
            hasReplay: s.has_replay,
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
      return { cursorString: null, scoreCount: 0 };
    }
    throw error;
  }

  const scores = page.scores.filter((s) => s.ruleset_id === 0);
  // Metadata is stored before the scores and the cursor so a failed lookup retries the whole page.
  await storeMissingUsers([...new Set(scores.map((s) => s.user_id))]);
  await storeMissingBeatmaps([...new Set(scores.map((s) => s.beatmap_id))]);
  await storeScores(scores);
  return { cursorString: page.cursor_string, scoreCount: page.scores.length };
}

export function startScoreFeed() {
  let cursorString: string | null | undefined;

  const tick = async () => {
    let scoreCount = 0;
    try {
      await ensureOsuAuth();
      if (cursorString === undefined) {
        cursorString = await loadCursor();
        console.log(`[score-feed] started from ${cursorString ? "saved cursor" : "newest scores"}`);
      }
      const result = await syncScoreFeedPage(cursorString);
      scoreCount = result.scoreCount;
      if (result.cursorString !== cursorString) {
        cursorString = result.cursorString;
        await saveCursor(cursorString);
      }
    } catch (error) {
      console.error("[score-feed] sync failed", error);
    }
    // A full page means we are behind the live feed, so catch up without waiting.
    setTimeout(tick, scoreCount < FULL_PAGE_SIZE ? POLL_INTERVAL_MS : 0);
  };

  void tick();
}
