import { BeatmapDecoder, ScoreDecoder } from "osu-parsers";
import { existsSync } from "fs";
import { readdir, rename } from "fs/promises";
import extract from "extract-zip";
import { v2 } from "osu-api-extended";

const scoreDecoder = new ScoreDecoder();
const beatmapDecoder = new BeatmapDecoder();

const getMediaPath = () => {
  const path = process.env.SAVE_MEDIA_PATH;
  if (!path) throw new Error("SAVE_MEDIA_PATH is not set");
  return path;
};

export const getScore = async (scoreId: string) => {
  const mediaPath = getMediaPath();
  const scorePath = `${mediaPath}/scores/${scoreId}.osr`;

  if (!existsSync(scorePath)) {
    console.log("Downloading Score", scoreId);
    const result = await v2.scores.download({
      id: parseInt(scoreId, 10),
      file_path: scorePath,
    });
    if (result.error) {
      throw result.error;
    }
    console.log("Score downloaded", scoreId);
  } else {
    console.log("Score already downloaded", scoreId);
  }

  const score = await scoreDecoder.decodeFromPath(scorePath);
  return score;
};

export const downloadBeatmapSet = async (beatmapSetId: number) => {
  const mediaPath = getMediaPath();
  const beatmapDir = `${mediaPath}/beatmaps/${beatmapSetId}`;

  if (existsSync(beatmapDir)) {
    console.log("Beatmap Set already downloaded", beatmapSetId);
  } else {
    console.log("Downloading Beatmap Set", beatmapSetId);
    const oszPath = `${mediaPath}/beatmaps/${beatmapSetId}.osz`;
    const result = await v2.beatmaps.download({
      type: "set",
      id: beatmapSetId,
      host: "osu_direct_mirror",
      file_path: oszPath,
    });
    if (result.error) {
      throw result.error;
    }
    await extract(oszPath, { dir: beatmapDir });
    for (const file of await readdir(beatmapDir)) {
      if (file.endsWith(".osu")) {
        const filePath = `${beatmapDir}/${file}`;
        const beatmap = await beatmapDecoder.decodeFromPath(filePath);
        await rename(
          filePath,
          `${beatmapDir}/${beatmap.metadata.beatmapId}.osu`,
        );
      }
    }
    console.log("Beatmap downloaded", beatmapSetId);
  }
};

export const getBeatmapFromHash = async (hash: string) => {
  const result = await v2.beatmaps.lookup({
    type: "difficulty",
    checksum: hash,
  });
  if (result.error) {
    throw result.error;
  }

  await downloadBeatmapSet(result.beatmapset_id);
  return result;
};
