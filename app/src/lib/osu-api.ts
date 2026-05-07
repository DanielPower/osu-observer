import { BeatmapDecoder, ScoreDecoder } from "osu-parsers";
import { existsSync } from "fs";
import { readdir, readFile, rename } from "fs/promises";
import { createHash } from "node:crypto";
import extract from "extract-zip";
import { v2, auth } from "osu-api-extended";
import path from "node:path";
import { rmSync } from "node:fs";
import {
  beatmap as beatmapTable,
  score as scoreTable,
  user as userTable,
} from "../db/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { simulateScore } from "osu-simulation";
import { StandardRuleset } from "osu-standard-stable";

const scoreDecoder = new ScoreDecoder();
const beatmapDecoder = new BeatmapDecoder();
const standard = new StandardRuleset();
const mediaPath = process.env.SAVE_MEDIA_PATH;

let authPromise: Promise<void> | null = null;

function ensureOsuAuth() {
  if (!authPromise) {
    authPromise = Promise.resolve(
      auth.login({
        type: "v2",
        client_id: process.env.OSU_CLIENT_ID!,
        client_secret: process.env.OSU_CLIENT_SECRET!,
        scopes: ["public"],
      }),
    ).then(() => {});
  }
  return authPromise;
}

export const ingestScore = async (scoreId: string) => {
  await ensureOsuAuth();
  const scorePath = `${mediaPath}/scores/${scoreId}.osr`;

  const result = await v2.scores.download({
    id: parseInt(scoreId, 10),
    file_path: scorePath,
  });
  if (result.error) {
    throw result.error;
  }

  const parsedScore = await scoreDecoder.decodeFromPath(scorePath);
  if (!parsedScore.replay) {
    throw new Error("No replay found");
  }

  const { beatmapSetId } = await getBeatmap(parsedScore.info.beatmapHashMD5);

  const beatmap = await beatmapDecoder.decodeFromPath(
    `${mediaPath}/beatmaps/${beatmapSetId}/${parsedScore.info.beatmapHashMD5}.osu`,
  );

  const modCombination = standard.createModCombination(
    parsedScore.info.rawMods,
  );
  const standardBeatmap = standard.applyToBeatmapWithMods(
    beatmap,
    modCombination,
  );

  const standardReplay = standard.applyToReplay(parsedScore.replay);
  const simulation = simulateScore(standardReplay, standardBeatmap);

  const user = await getUserFromUsername(parsedScore.info.username);

  const [score] = await db
    .insert(scoreTable)
    .values({
      id: scoreId,
      beatmapMd5: parsedScore.info.beatmapHashMD5,
      userId: user.id,
      simulation,
      mods: parsedScore.info.rawMods as number,
    })
    .returning();
  return score;
};

export const getScore = async (scoreId: string) => {
  let score = await db.query.score.findFirst({
    where: eq(scoreTable.id, scoreId),
  });

  if (score) {
    console.log("Score already downloaded", scoreId);
    return score;
  }

  console.log("Downloading Score", scoreId);
  score = await ingestScore(scoreId);
  console.log("Done");

  return score;
};

export const ingestBeatmapSet = async (md5: string) => {
  await ensureOsuAuth();
  const result = await v2.beatmaps.lookup({
    type: "difficulty",
    checksum: md5,
  });
  if (result.error) {
    throw result.error;
  }

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
        const beatmap = await beatmapDecoder.decodeFromPath(filePath);
        const fileHash = createHash("md5")
          .update(await readFile(filePath))
          .digest("hex");
        await rename(filePath, `${beatmapDir}/${fileHash}.osu`);
        await db.insert(beatmapTable).values({
          md5: fileHash,
          beatmapSetId,
          title: beatmap.metadata.title,
          version: beatmap.metadata.version,
          artist: beatmap.metadata.artist,
          creator: beatmap.metadata.creator,
        });
      }
    }
    rmSync(oszPath);
    console.log("Done");
  }
};

export const getBeatmap = async (md5: string) => {
  let beatmap = await db.query.beatmap.findFirst({
    where: (beatmap) => eq(beatmap.md5, md5),
  });
  if (!beatmap) {
    await ingestBeatmapSet(md5);
    beatmap = await db.query.beatmap.findFirst({
      where: (beatmap) => eq(beatmap.md5, md5),
    });
    if (!beatmap) {
      throw new Error(`Beatmap not found after ingesting: ${md5}`);
    }
  }
  return beatmap;
};

export const getUser = async (id: number) => {
  let user = await db.query.user.findFirst({
    where: (user) => eq(user.id, id),
  });
  if (user) {
    return user;
  }

  const result = await v2.users.details({
    user: id,
    key: "id",
  });
  if ("error" in result && result.error) {
    throw result.error;
  }
  [user] = await db
    .insert(userTable)
    .values({
      id: result.id,
      username: result.username,
      avatarUrl: result.avatar_url,
    })
    .returning();
  return user;
};

export const getUserFromUsername = async (username: string) => {
  let user = await db.query.user.findFirst({
    where: (user) => eq(user.username, username),
  });
  if (user) {
    return user;
  }

  const result = await v2.users.details({
    user: username,
    key: "username",
  });
  if ("error" in result && result.error) {
    throw result.error;
  }
  [user] = await db
    .insert(userTable)
    .values({
      id: result.id,
      username: result.username,
      avatarUrl: result.avatar_url,
    })
    .returning();
  return user;
};
