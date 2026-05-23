import { BeatmapDecoder, ScoreDecoder } from "osu-parsers";
import { existsSync } from "fs";
import { readdir, readFile, mkdir, writeFile } from "fs/promises";
import { Vibrant } from "node-vibrant/node";
import { createHash } from "node:crypto";
import { unzip } from "unzipit";
import { v2, auth } from "osu-api-extended";
import path from "node:path";
import { rmSync } from "node:fs";
import { beatmap as beatmapTable, score as scoreTable, user as userTable } from "../db/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { simulateScore } from "osu-simulation";
import { StandardRuleset } from "osu-standard-stable";
import { SAVE_MEDIA_PATH, OSU_CLIENT_ID, OSU_CLIENT_SECRET } from "../env";

const scoreDecoder = new ScoreDecoder();
const beatmapDecoder = new BeatmapDecoder();
const SWATCH_PRIORITY = [
  "Vibrant",
  "LightVibrant",
  "DarkVibrant",
  "Muted",
  "DarkMuted",
  "LightMuted",
] as const;

async function extractBgColor(imagePath: string): Promise<string | null> {
  try {
    const palette = await Vibrant.from(imagePath).getPalette();
    for (const role of SWATCH_PRIORITY) {
      const swatch = palette[role];
      if (swatch) return swatch.hex;
    }
    return null;
  } catch {
    return null;
  }
}
const standard = new StandardRuleset();
const mediaPath = SAVE_MEDIA_PATH;

let authPromise: Promise<void> | null = null;

function ensureOsuAuth() {
  if (!authPromise) {
    authPromise = Promise.resolve(
      auth.login({
        type: "v2",
        client_id: OSU_CLIENT_ID,
        client_secret: OSU_CLIENT_SECRET,
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

  const { beatmapSetId, beatmapFilename } = await getBeatmap(parsedScore.info.beatmapHashMD5);

  const beatmap = await beatmapDecoder.decodeFromPath(
    `${mediaPath}/beatmaps/${beatmapSetId}/${beatmapFilename}`,
  );

  const modCombination = standard.createModCombination(parsedScore.info.rawMods);
  const standardBeatmap = standard.applyToBeatmapWithMods(beatmap, modCombination);

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
    const downloadResult = await v2.beatmaps.download({
      type: "set",
      id: beatmapSetId,
      host: "osu_direct_mirror",
      file_path: oszPath,
    });
    if (downloadResult.error) {
      throw downloadResult.error;
    }
    const buffer = await readFile(oszPath);
    const { entries } = await unzip(buffer);
    await Promise.all(
      Object.entries(entries)
        .filter(([name]) => !name.endsWith("/"))
        .map(async ([name, entry]) => {
          const dest = path.join(beatmapDir, name);
          await mkdir(path.dirname(dest), { recursive: true });
          await writeFile(dest, Buffer.from(await entry.arrayBuffer()));
        }),
    );
    const files = (await readdir(beatmapDir)).filter((f) => f.endsWith(".osu"));
    await Promise.all(
      files.map(async (file) => {
        const filePath = `${beatmapDir}/${file}`;
        const parsedBeatmap = await beatmapDecoder.decodeFromPath(filePath);
        const fileHash = createHash("md5")
          .update(await readFile(filePath))
          .digest("hex");
        const beatmap = await v2.beatmaps.lookup({
          type: "difficulty",
          checksum: fileHash,
        });
        const bgFilename = parsedBeatmap.events.backgroundPath ?? null;
        const bgColor = bgFilename ? await extractBgColor(`${beatmapDir}/${bgFilename}`) : null;
        await db
          .insert(beatmapTable)
          .values({
            artist: parsedBeatmap.metadata.artist,
            beatmapFilename: file,
            beatmapId: beatmap.id,
            beatmapSetId,
            bgColor,
            bgFilename,
            creator: parsedBeatmap.metadata.creator,
            md5: fileHash,
            title: beatmap.beatmapset.title,
            version: beatmap.version,
          })
          .onConflictDoUpdate({
            target: beatmapTable.md5,
            set: {
              artist: parsedBeatmap.metadata.artist,
              beatmapFilename: file,
              beatmapId: beatmap.id,
              beatmapSetId,
              bgColor,
              bgFilename,
              creator: parsedBeatmap.metadata.creator,
              md5: fileHash,
              title: beatmap.beatmapset.title,
              version: beatmap.version,
            },
          });
      }),
    );
    rmSync(oszPath);
    console.log("Done");
  }
};

export const getBeatmap = async (md5: string) => {
  let beatmap = await db.query.beatmap.findFirst({
    where: (row) => eq(row.md5, md5),
  });
  if (!beatmap || !beatmap.beatmapId) {
    await ingestBeatmapSet(md5);
    beatmap = await db.query.beatmap.findFirst({
      where: (row) => eq(row.md5, md5),
    });
    if (!beatmap) {
      throw new Error(`Beatmap not found after ingesting: ${md5}`);
    }
  }
  return beatmap;
};

export const getUser = async (id: number) => {
  let user = await db.query.user.findFirst({
    where: (row) => eq(row.id, id),
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
    where: (row) => eq(row.username, username),
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
