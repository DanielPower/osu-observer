import { BeatmapDecoder, ScoreDecoder } from "osu-parsers";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { Vibrant } from "node-vibrant/node";
import { createHash } from "node:crypto";
import { type FileEntry, Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js";
import { v2, auth } from "osu-api-extended";
import { join, posix } from "node:path";
import { tmpdir } from "node:os";
import { beatmap as beatmapTable, score as scoreTable, user as userTable } from "../db/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { simulateScore } from "osu-simulation";
import { StandardRuleset } from "osu-standard-stable";
import { OSU_CLIENT_ID, OSU_CLIENT_SECRET } from "../env";
import { mediaContentType, putMediaObject, readMediaObject } from "./media-storage";

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

async function extractBgColor(image: Uint8Array): Promise<string | null> {
  try {
    const palette = await Vibrant.from(Buffer.from(image)).getPalette();
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

async function downloadToTemporaryFile(
  extension: string,
  download: (filePath: string) => Promise<{ error?: unknown }>,
): Promise<Uint8Array> {
  const directory = await mkdtemp(join(tmpdir(), "observer-"));
  const filePath = join(directory, `download${extension}`);
  try {
    const result = await download(filePath);
    if (result.error) throw result.error;
    return await readFile(filePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export const ingestScore = async (scoreId: string) => {
  await ensureOsuAuth();
  const scoreBytes = await downloadToTemporaryFile(".osr", (filePath) =>
    v2.scores.download({
      id: parseInt(scoreId, 10),
      file_path: filePath,
    }),
  );
  await putMediaObject(`scores/${scoreId}.osr`, scoreBytes, "application/octet-stream");

  const parsedScore = await scoreDecoder.decodeFromBuffer(scoreBytes);
  if (!parsedScore.replay) {
    throw new Error("No replay found");
  }

  const { beatmapSetId, beatmapFilename } = await getBeatmap(parsedScore.info.beatmapHashMD5);

  const beatmapBytes = await readMediaObject(`beatmaps/${beatmapSetId}/${beatmapFilename}`);
  if (!beatmapBytes) throw new Error(`Beatmap object not found: ${beatmapFilename}`);
  const beatmap = beatmapDecoder.decodeFromBuffer(beatmapBytes);

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

export type SkinManifestEntry = { id: string; name: string; comboColors: number[] };

export const getSkins = async (): Promise<SkinManifestEntry[]> => {
  const raw = await readMediaObject("skins/skins.json");
  return raw ? (JSON.parse(new TextDecoder().decode(raw)) as SkinManifestEntry[]) : [];
};

function safeArchiveFilename(filename: string): string | null {
  const normalized = posix.normalize(filename.replaceAll("\\", "/")).replace(/^\/+/, "");
  if (!normalized || normalized === ".." || normalized.startsWith("../")) return null;
  return normalized;
}

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
  console.log("Downloading Beatmap Set", beatmapSetId);
  const archiveBytes = await downloadToTemporaryFile(".osz", (filePath) =>
    v2.beatmaps.download({
      type: "set",
      id: beatmapSetId,
      host: "osu_direct_mirror",
      file_path: filePath,
    }),
  );

  const zipReader = new ZipReader(new Uint8ArrayReader(archiveBytes));
  const entries = await zipReader.getEntries();
  const files = await Promise.all(
    entries
      .filter((entry): entry is FileEntry => !entry.directory)
      .flatMap((entry) => {
        const filename = safeArchiveFilename(entry.filename);
        return filename
          ? [
              entry
                .getData(new Uint8ArrayWriter())
                .then((data) => ({ filename, data: new Uint8Array(data) })),
            ]
          : [];
      }),
  );
  await zipReader.close();

  await Promise.all(
    files.map(({ filename, data }) =>
      putMediaObject(`beatmaps/${beatmapSetId}/${filename}`, data, mediaContentType(filename)),
    ),
  );

  const filesByName = new Map(files.map((file) => [file.filename.toLowerCase(), file.data]));
  await Promise.all(
    files
      .filter(({ filename }) => filename.toLowerCase().endsWith(".osu"))
      .map(async ({ filename, data }) => {
        const parsedBeatmap = beatmapDecoder.decodeFromBuffer(data);
        const fileHash = createHash("md5").update(data).digest("hex");
        const beatmap = await v2.beatmaps.lookup({
          type: "difficulty",
          checksum: fileHash,
        });
        const bgFilename = parsedBeatmap.events.backgroundPath ?? null;
        const bgObjectFilename = bgFilename
          ? posix.join(posix.dirname(filename), bgFilename)
          : null;
        const background = bgObjectFilename
          ? filesByName.get(bgObjectFilename.toLowerCase())
          : undefined;
        const bgColor = background ? await extractBgColor(background) : null;
        await db
          .insert(beatmapTable)
          .values({
            artist: parsedBeatmap.metadata.artist,
            beatmapFilename: filename,
            beatmapId: beatmap.id,
            beatmapSetId,
            bgColor,
            bgFilename: bgObjectFilename,
            creator: parsedBeatmap.metadata.creator,
            md5: fileHash,
            title: beatmap.beatmapset.title,
            version: beatmap.version,
          })
          .onConflictDoUpdate({
            target: beatmapTable.md5,
            set: {
              artist: parsedBeatmap.metadata.artist,
              beatmapFilename: filename,
              beatmapId: beatmap.id,
              beatmapSetId,
              bgColor,
              bgFilename: bgObjectFilename,
              creator: parsedBeatmap.metadata.creator,
              md5: fileHash,
              title: beatmap.beatmapset.title,
              version: beatmap.version,
            },
          });
      }),
  );
  console.log("Done");
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
