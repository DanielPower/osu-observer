import { MEDIA_BASE_URL, SITE_URL } from "../env";
import {
  findStoredBeatmap,
  findStoredScore,
  findStoredUser,
  getBeatmap,
  getScore,
  getSkins,
  getUser,
  replayFramesKey,
  scoreLazerMods,
} from "./osu-api";
import { mediaUrl } from "./media-url";

type StoredScore = NonNullable<Awaited<ReturnType<typeof findStoredScore>>>;
type StoredBeatmap = NonNullable<Awaited<ReturnType<typeof findStoredBeatmap>>>;
type StoredUser = NonNullable<Awaited<ReturnType<typeof findStoredUser>>>;

const scorePageData = async (score: StoredScore, beatmap: StoredBeatmap, player: StoredUser) => {
  const beatmapDir = `beatmaps/${beatmap.beatmapSetId}`;
  return {
    score: {
      id: score.id,
      replayUrl: `${MEDIA_BASE_URL}/${replayFramesKey(score.id)}`,
      mods: scoreLazerMods(score),
      modAcronyms: scoreLazerMods(score).map((mod) => mod.acronym),
      stats: {
        totalScore: score.totalScore,
        accuracy: score.accuracy,
        pp: score.pp,
        maxCombo: score.maxCombo,
        rank: score.rank,
      },
    },
    player: {
      id: player.id,
      username: player.username,
      avatarUrl: encodeURI(player.avatarUrl),
    },
    beatmap: {
      beatmapId: beatmap.beatmapId,
      beatmapSetId: beatmap.beatmapSetId,
      title: beatmap.title,
      artist: beatmap.artist,
      creator: beatmap.creator,
      version: beatmap.version,
      beatmapUrl: mediaUrl(MEDIA_BASE_URL, `${beatmapDir}/${beatmap.beatmapFilename}`),
      bgUrl: mediaUrl(MEDIA_BASE_URL, `${beatmapDir}/${beatmap.bgFilename}`),
      bgColor: beatmap.bgColor,
    },
    mediaPath: MEDIA_BASE_URL,
    siteUrl: SITE_URL,
    skins: await getSkins(),
  };
};

export type ScorePageData = Awaited<ReturnType<typeof scorePageData>>;

// Everything the score page shows, fetching the replay, beatmap and player from osu! if needed.
export const loadScorePageData = async (scoreId: string) => {
  const score = await getScore(scoreId);
  if (!score) {
    throw new Error(
      "osu! only keeps replays for the top 1000 scores on ranked, loved and qualified maps.",
    );
  }
  const [beatmap, player] = await Promise.all([
    getBeatmap(score.beatmapMd5),
    getUser(score.userId),
  ]);
  return scorePageData(score, beatmap, player);
};

// The same, but only from what's already stored: never calls the osu! API or a beatmap mirror.
// Null if anything is missing.
export const loadStoredScorePageData = async (scoreId: string) => {
  const score = await findStoredScore(scoreId);
  if (!score) return null;
  const [beatmap, player] = await Promise.all([
    findStoredBeatmap(score.beatmapMd5),
    findStoredUser(score.userId),
  ]);
  if (!beatmap || !player) return null;
  return scorePageData(score, beatmap, player);
};
