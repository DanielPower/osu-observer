import { ScoreDecoder } from "osu-parsers";
import { existsSync } from "fs";
import { readdir, readFile, rename } from "fs/promises";
import { createHash } from "node:crypto";
import extract from "extract-zip";
import { v2 } from "osu-api-extended";
import path from "node:path";
import { rmSync } from "node:fs";

const scoreDecoder = new ScoreDecoder();

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

export const getBeatmapFromHash = async (hash: string) => {
  const result = await v2.beatmaps.lookup({
    type: "difficulty",
    checksum: hash,
  });
  if (result.error) {
    throw result.error;
  }

  const mediaPath = getMediaPath();
  console.log(result);
  const beatmapSetId = result.beatmapset_id;
  const beatmapDir = path.resolve(`${mediaPath}/beatmaps/${beatmapSetId}`);

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
        const fileHash = createHash("md5")
          .update(await readFile(filePath))
          .digest("hex");
        await rename(filePath, `${beatmapDir}/${fileHash}.osu`);
      }
    }
    rmSync(oszPath);
    console.log("Beatmap downloaded", beatmapSetId);
  }

  return result;
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
