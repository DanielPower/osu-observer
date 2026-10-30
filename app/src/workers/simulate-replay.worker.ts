import { BeatmapDecoder } from "osu-parsers";
import { StandardRuleset } from "osu-standard-stable";
import { decodeScore, simulateScore, type LazerMod } from "osu-simulation";

export type SimulateReplayRequest = { replayUrl: string; beatmapUrl: string; mods: LazerMod[] };

async function download(url: string, label: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't download the ${label} (HTTP ${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

// Simulating a long replay takes seconds on slower devices, so it runs off the main thread.
self.onmessage = async ({ data }: MessageEvent<SimulateReplayRequest>) => {
  try {
    const [replayBytes, beatmapBytes] = await Promise.all([
      download(data.replayUrl, "replay"),
      download(data.beatmapUrl, "beatmap"),
    ]);
    const score = await decodeScore(replayBytes);
    if (!score.replay) throw new Error("This score has no replay");
    const beatmap = new BeatmapDecoder().decodeFromBuffer(beatmapBytes);
    const replay = new StandardRuleset().applyToReplay(score.replay);
    self.postMessage({ simulation: simulateScore(replay, beatmap, data.mods) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
