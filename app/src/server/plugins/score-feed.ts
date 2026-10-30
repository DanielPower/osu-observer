import { definePlugin } from "nitro";
import { SCORE_FEED_ENABLED } from "../../env";
import { startScoreFeed, startScoreFeedCleanup } from "../../lib/score-feed";
import { startSpeedrunReplayDownloads } from "../../lib/speedrun-replays";

export default definePlugin(() => {
  if (!SCORE_FEED_ENABLED) return;
  startScoreFeed();
  startScoreFeedCleanup();
  startSpeedrunReplayDownloads();
});
