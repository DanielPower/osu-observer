import { definePlugin } from "nitro";
import { SCORE_FEED_ENABLED } from "../../env";
import { startScoreFeed, startScoreFeedCleanup } from "../../lib/score-feed";

export default definePlugin(() => {
  if (!SCORE_FEED_ENABLED) return;
  startScoreFeed();
  startScoreFeedCleanup();
});
