import { BeatmapDecoder } from "osu-parsers";
import { readReplayFrames, simulateScore, type LazerMod } from "osu-simulation";

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
    // The browser has already undone the file's brotli Content-Encoding.
    const frames = readReplayFrames(replayBytes);
    const beatmap = new BeatmapDecoder().decodeFromBuffer(beatmapBytes);
    self.postMessage({ simulation: simulateScore(frames, beatmap, data.mods) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
