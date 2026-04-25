import { BeatmapDecoder, ScoreDecoder } from "osu-parsers";
import { existsSync } from "fs";
import { readdir, rename } from "fs/promises";
import extract from "extract-zip";
import { v2 } from "osu-api-extended";
import { Vibrant } from "node-vibrant/node";

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

/**
 * Read the background image filename from an on-disk .osu beatmap file.
 */
export const getBackgroundPath = async (
  beatmapSetId: number,
  beatmapId: number,
): Promise<string | null> => {
  const osuPath = `${getMediaPath()}/beatmaps/${beatmapSetId}/${beatmapId}.osu`;
  if (!existsSync(osuPath)) return null;
  try {
    const beatmap = await beatmapDecoder.decodeFromPath(osuPath);
    return beatmap.events.backgroundPath || null;
  } catch {
    return null;
  }
};

const SWATCH_PRIORITY = [
  "Vibrant",
  "LightVibrant",
  "DarkVibrant",
  "Muted",
  "DarkMuted",
  "LightMuted",
] as const;

/**
 * Extract the dominant accent color from an image file on disk.
 * Uses the same swatch priority order as the client-side colorthief.
 */
export const extractAccentColor = async (
  imagePath: string,
): Promise<string | null> => {
  if (!existsSync(imagePath)) return null;

  try {
    const palette = await Vibrant.from(imagePath).getPalette();
    for (const role of SWATCH_PRIORITY) {
      const swatch = palette[role];
      if (swatch) return swatch.hex;
    }
    return null;
  } catch (err) {
    console.warn("Accent color extraction failed:", err);
    return null;
  }
};

export const lookupUserByUsername = async (
  username: string,
): Promise<{ id: number; username: string; avatarUrl: string } | null> => {
  try {
    const result = await v2.users.details({
      user: username,
      key: "username",
    });
    if ("error" in result && result.error) return null;
    return {
      id: result.id,
      username: result.username,
      avatarUrl: result.avatar_url,
    };
  } catch (err) {
    console.warn(`User lookup failed for ${username}:`, err);
    return null;
  }
};
