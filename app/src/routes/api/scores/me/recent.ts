import { createFileRoute } from "@tanstack/react-router";
import { getSession } from "../../../../lib/auth";

export const Route = createFileRoute("/api/scores/me/recent")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const match = (request.headers.get("cookie") ?? "").match(
          /(?:^|;\s*)session=([^;]*)/,
        );
        const session = await getSession(
          match ? decodeURIComponent(match[1]!) : undefined,
        );
        if (!session)
          return Response.json({ error: "Unauthorized" }, { status: 401 });

        const url = new URL(request.url);
        const limit = Math.min(
          Math.max(Number(url.searchParams.get("limit") ?? "10"), 1),
          50,
        );
        const includeFails =
          url.searchParams.get("include_fails") === "1" ? "1" : "0";

        const osuUrl = new URL(
          `https://osu.ppy.sh/api/v2/users/${session.user_id}/scores/recent`,
        );
        osuUrl.searchParams.set("limit", String(limit));
        osuUrl.searchParams.set("include_fails", includeFails);

        const res = await fetch(osuUrl, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.error(
            `osu! /users/${session.user_id}/scores/recent failed (${res.status}):`,
            body,
          );
          return Response.json(
            { error: `Failed to fetch recent scores (${res.status})` },
            { status: 500 },
          );
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

        return Response.json(
          scores.map((s) => ({
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
            coverList:
              s.beatmapset.covers["list@2x"] ?? s.beatmapset.covers.list,
          })),
        );
      },
    },
  },
});
