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
import { decodeReplayFrames, encodeReplayFrames, type LazerMod } from "osu-simulation";
import { StandardRuleset } from "osu-standard-stable";
import { OSU_CLIENT_ID, OSU_CLIENT_SECRET } from "../env";
import { beatmapMirrors } from "./beatmap-mirrors";
import { osuRequest } from "./osu-rate-limit";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants } from "node:zlib";
import {
  deleteMediaObject,
  mediaContentType,
  putMediaObject,
  readMediaObject,
} from "./media-storage";

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

export const modAcronyms = (rawMods: number): string[] =>
  standard.createModCombination(rawMods).acronyms.filter((acronym) => acronym !== "NM");

// The legacy bitmask in the .osr can't hold lazer-only mods or settings (a custom
// DT rate, Difficulty Adjust), so mods come from the score's API details.
const lazerModsFrom = (details: { mods: { acronym: string; settings?: object }[] }): LazerMod[] =>
  details.mods.map(({ acronym, settings }) => ({
    acronym,
    ...(settings && Object.keys(settings).length > 0 && { settings: { ...settings } }),
  }));

// The best guess for a score stored before lazer mods were: its legacy mods, without settings.
export const scoreLazerMods = (score: { lazerMods: LazerMod[] | null; mods: number }) =>
  score.lazerMods ?? modAcronyms(score.mods).map((acronym) => ({ acronym }));

let authPromise: Promise<void> | null = null;

export function ensureOsuAuth() {
  if (!authPromise) {
    authPromise = Promise.resolve(
      auth.login({
        type: "v2",
        client_id: OSU_CLIENT_ID,
        client_secret: OSU_CLIENT_SECRET,
        scopes: ["public"],
      }),
    ).then(
      () => {},
      (error: unknown) => {
        // Don't cache a failed login, or one network blip would break osu! access until restart.
        authPromise = null;
        throw error;
      },
    );
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

// Only lazer osu!standard scores with a replay can be simulated. Stable scores
// carry a legacy_score_id.
async function getReplayableScoreDetails(scoreId: string) {
  const id = Number(scoreId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid score ID");

  const details = await osuRequest(() => v2.scores.details({ id }));
  if (details.error) {
    throw new Error(
      "Score not found. Note that osu! only stores the top 1000 scores on Ranked, Loved, and Qualified maps",
      { cause: details.error },
    );
  }
  if (details.ruleset_id !== 0) throw new Error("Only osu!standard scores are supported");
  if (details.legacy_score_id !== null) {
    throw new Error("Only scores set in osu!lazer are supported");
  }
  if (!details.has_replay) throw new Error("This score has no replay");
  return details;
}

// Fills in lazer mods for a score stored before they were, so later views skip the lookup.
async function backfillLazerMods(score: typeof scoreTable.$inferSelect) {
  try {
    await ensureOsuAuth();
    const lazerMods = lazerModsFrom(await getReplayableScoreDetails(score.id));
    await db.update(scoreTable).set({ lazerMods }).where(eq(scoreTable.id, score.id));
    return lazerMods;
  } catch (error) {
    console.error(`Failed to fetch lazer mods for score ${score.id}`, error);
    return null;
  }
}

const compressBrotli = promisify(brotliCompress);

export const replayFramesKey = (scoreId: string) => `scores/${scoreId}.frames`;

// Stores a replay's frames brotli-compressed, served with Content-Encoding: br so the
// browser decompresses them natively while downloading. Quality 9 is about 0.3 s of
// CPU for a 22 minute replay; 10 and 11 are a few percent smaller but 5-10x slower.
async function storeReplayFrames(scoreId: string, osr: Uint8Array) {
  const frames = encodeReplayFrames(decodeReplayFrames(osr));
  const compressed = await compressBrotli(frames, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 9,
      [zlibConstants.BROTLI_PARAM_LGWIN]: 24,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: frames.byteLength,
    },
  });
  await putMediaObject(replayFramesKey(scoreId), compressed, "application/octet-stream", "br");
}

// Converts a score stored before replays were kept as frames, and deletes its .osr.
async function convertStoredReplay(score: typeof scoreTable.$inferSelect) {
  const osrKey = `scores/${score.id}.osr`;
  const osr = await readMediaObject(osrKey);
  if (!osr) throw new Error(`Replay for score ${score.id} is missing`);
  await storeReplayFrames(score.id, osr);
  await db.update(scoreTable).set({ framesStored: true }).where(eq(scoreTable.id, score.id));
  await deleteMediaObject(osrKey);
  return { ...score, framesStored: true };
}

// Downloads a score's replay and stores its frames. Browsers simulate from the stored frames.
export const storeScoreReplay = async (scoreId: string) => {
  const existing = await db.query.score.findFirst({ where: eq(scoreTable.id, scoreId) });
  if (existing) return existing;

  await ensureOsuAuth();
  const details = await getReplayableScoreDetails(scoreId);
  const scoreBytes = await downloadToTemporaryFile(".osr", (filePath) =>
    osuRequest(() => v2.scores.download({ id: details.id, file_path: filePath }), {
      download: true,
    }),
  );
  await storeReplayFrames(scoreId, scoreBytes);
  // Only the header is needed here, so the replay isn't decompressed a second time.
  const parsedScore = await new ScoreDecoder().decodeFromBuffer(scoreBytes, false);
  // The score row references its beatmap, so ingest the beatmap first if it's new.
  await getBeatmap(parsedScore.info.beatmapHashMD5);

  // The replay's username is the name at the time of play, so use the score's user ID.
  const [user] = await db
    .insert(userTable)
    .values({
      id: details.user.id,
      username: details.user.username,
      avatarUrl: details.user.avatar_url,
    })
    .onConflictDoUpdate({
      target: userTable.id,
      set: { username: details.user.username, avatarUrl: details.user.avatar_url },
    })
    .returning();

  const [score] = await db
    .insert(scoreTable)
    .values({
      id: scoreId,
      beatmapMd5: parsedScore.info.beatmapHashMD5,
      userId: user.id,
      mods: parsedScore.info.rawMods as number,
      lazerMods: lazerModsFrom(details),
      framesStored: true,
    })
    // Another server may have stored the score while this one was downloading it.
    .onConflictDoNothing({ target: scoreTable.id })
    .returning();
  return score ?? (await db.query.score.findFirst({ where: eq(scoreTable.id, scoreId) }))!;
};

// Concurrent first views of a score share one download.
const pendingScores = new Map<string, ReturnType<typeof loadScore>>();

export const getScore = (scoreId: string) => {
  let pending = pendingScores.get(scoreId);
  if (!pending) {
    pending = loadScore(scoreId).finally(() => {
      // oxlint-disable-next-line drizzle/enforce-delete-with-where
      pendingScores.delete(scoreId);
    });
    pendingScores.set(scoreId, pending);
  }
  return pending;
};

const loadScore = async (scoreId: string) => {
  let score = await storeScoreReplay(scoreId);
  if (!score.framesStored) score = await convertStoredReplay(score);
  if (score.lazerMods) return score;
  return { ...score, lazerMods: await backfillLazerMods(score) };
};

export type SkinManifestEntry = {
  id: string;
  name: string;
  comboColors: number[];
  /** A hash of the skin's file, so clients don't reuse a cached copy after a re-ingest. */
  version?: string;
};

export const getSkins = async (): Promise<SkinManifestEntry[]> => {
  const raw = await readMediaObject("skins/skins.json");
  return raw ? (JSON.parse(new TextDecoder().decode(raw)) as SkinManifestEntry[]) : [];
};

function safeArchiveFilename(filename: string): string | null {
  const normalized = posix.normalize(filename.replaceAll("\\", "/")).replace(/^\/+/, "");
  if (!normalized || normalized === ".." || normalized.startsWith("../")) return null;
  return normalized;
}

async function extractArchive(archive: Uint8Array) {
  const zipReader = new ZipReader(new Uint8ArrayReader(archive));
  try {
    const entries = await zipReader.getEntries();
    return await Promise.all(
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
  } finally {
    await zipReader.close();
  }
}

export const ingestBeatmapSet = async (md5: string) => {
  await ensureOsuAuth();
  const result = await osuRequest(() =>
    v2.beatmaps.lookup({
      type: "difficulty",
      checksum: md5,
    }),
  );
  if (result.error) {
    throw result.error;
  }

  const beatmapSetId = result.beatmapset_id;
  console.log("Downloading Beatmap Set", beatmapSetId);
  const files = await beatmapMirrors.download(beatmapSetId, async (archive) => {
    const extracted = await extractArchive(archive);
    const containsBeatmap = extracted.some(
      ({ filename, data }) =>
        filename.toLowerCase().endsWith(".osu") &&
        createHash("md5").update(data).digest("hex") === md5,
    );
    return containsBeatmap ? extracted : null;
  });

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
        const beatmap = await osuRequest(() =>
          v2.beatmaps.lookup({
            type: "difficulty",
            checksum: fileHash,
          }),
        );
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

  const result = await osuRequest(() =>
    v2.users.details({
      user: id,
      key: "id",
    }),
  );
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
    .onConflictDoUpdate({
      target: userTable.id,
      set: { username: result.username, avatarUrl: result.avatar_url },
    })
    .returning();
  return user;
};
