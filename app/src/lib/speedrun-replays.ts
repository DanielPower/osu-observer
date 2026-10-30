import { asc, eq, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { speedrunReplay } from "../db/schema";
import { getScore } from "./osu-api";

// One download at a time, spaced out, to stay well inside osu!'s rate limits.
const DOWNLOAD_INTERVAL_MS = 2000;
const IDLE_INTERVAL_MS = 60 * 1000;
const RETRY_BASE_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

async function downloadNext() {
  const [next] = await db
    .select()
    .from(speedrunReplay)
    .where(lte(speedrunReplay.nextAttemptAt, new Date()))
    // The oldest scores are the closest to being deleted by osu!.
    .orderBy(asc(speedrunReplay.scoreId))
    .limit(1);
  if (!next) return false;

  try {
    await getScore(String(next.scoreId));
    await db.delete(speedrunReplay).where(eq(speedrunReplay.scoreId, next.scoreId));
  } catch (error) {
    const attempts = next.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      console.error(`[speedruns] gave up downloading replay ${next.scoreId}`, error);
      await db.delete(speedrunReplay).where(eq(speedrunReplay.scoreId, next.scoreId));
    } else {
      console.warn(`[speedruns] replay ${next.scoreId} failed, attempt ${attempts}`, error);
      await db
        .update(speedrunReplay)
        .set({
          attempts,
          nextAttemptAt: sql`now() + ${`${RETRY_BASE_MS * 2 ** attempts} milliseconds`}::interval`,
        })
        .where(eq(speedrunReplay.scoreId, next.scoreId));
    }
  }
  return true;
}

export function startSpeedrunReplayDownloads() {
  const run = async () => {
    let busy = false;
    try {
      busy = await downloadNext();
    } catch (error) {
      console.error("[speedruns] replay download queue failed", error);
    }
    setTimeout(run, busy ? DOWNLOAD_INTERVAL_MS : IDLE_INTERVAL_MS);
  };

  void run();
}
