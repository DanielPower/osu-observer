import { defineHandler, getCookie, getQuery, setResponseStatus } from "h3";
import { getSession } from "../../../../lib/auth";

export default defineHandler(async (event) => {
  const session = await getSession(getCookie(event, "session"));
  if (!session) {
    setResponseStatus(event, 401);
    return { error: "Unauthorized" };
  }

  const query = getQuery(event);
  const limit = Math.min(Math.max(Number(query.limit ?? "10"), 1), 50);
  const includeFails = query.include_fails === "1" ? "1" : "0";

  const url = new URL(
    `https://osu.ppy.sh/api/v2/users/${session.user_id}/scores/recent`,
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("include_fails", includeFails);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `osu! /users/${session.user_id}/scores/recent failed (${res.status}):`,
      body,
    );
    setResponseStatus(event, 500);
    return { error: `Failed to fetch recent scores (${res.status})` };
  }

  const scores = (await res.json()) as Array<{
    id: number;
    legacy_score_id?: number | null;
    replay: boolean;
    has_replay?: boolean;
    accuracy: number;
    rank: string;
    pp: number | null;
    user: { id: number; username: string; avatar_url: string };
    beatmap: { id: number; version: string };
    beatmapset: {
      id: number;
      title: string;
      artist: string;
      creator: string;
      covers: Record<string, string>;
    };
  }>;

  return scores.map((s) => ({
    scoreId: String(s.legacy_score_id ?? s.id),
    replayAvailable: s.replay ?? s.has_replay ?? false,
    rank: s.rank,
    accuracy: s.accuracy,
    pp: s.pp,
    user: {
      id: s.user.id,
      username: s.user.username,
      avatarUrl: s.user.avatar_url,
    },
    beatmapSetId: s.beatmapset.id,
    title: s.beatmapset.title,
    artist: s.beatmapset.artist,
    version: s.beatmap.version,
    creator: s.beatmapset.creator,
    coverList: s.beatmapset.covers["list@2x"] ?? s.beatmapset.covers.list,
  }));
});
