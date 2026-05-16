import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import { Badge, Box, Flex, Spinner, Text } from "@radix-ui/themes";
import { useEffect } from "react";
import { z } from "zod";
import { ReplayViewer } from "../../components/ReplayViewer";
import { UserBadge } from "../../components/UserBadge";
import { Comments } from "../../components/Comments";
import { accentVarsToCss } from "../../lib/accentVars";
import { getScore, getBeatmap, getUser } from "../../lib/osu-api";
import type { Simulation } from "osu-renderer";
import { SERVE_MEDIA_PATH } from "../../env";

const searchSchema = z.object({
  skin: z.string().default("default"),
});

const getScoreData = createServerFn({ method: "GET" })
  .inputValidator((scoreId: string) => scoreId)
  .handler(async ({ data: scoreId }) => {
    const score = await getScore(scoreId);
    if (!score) {
      throw new Error(
        "Score not found. Note that osu! only stores the top 1000 scores on Ranked, Loved, and Qualified maps",
      );
    }
    const [beatmap, player] = await Promise.all([
      getBeatmap(score.beatmapMd5),
      getUser(score.userId),
    ]);
    const beatmapBase = `${SERVE_MEDIA_PATH}/beatmaps/${beatmap.beatmapSetId}`;
    return {
      score: {
        id: score.id,
        simulation: score.simulation as Simulation,
        mods: score.mods,
      },
      player: {
        id: player.id,
        username: player.username,
        avatarUrl: player.avatarUrl,
      },
      beatmap: {
        beatmapId: beatmap.beatmapId,
        beatmapSetId: beatmap.beatmapSetId,
        title: beatmap.title,
        artist: beatmap.artist,
        creator: beatmap.creator,
        version: beatmap.version,
        beatmapUrl: `${beatmapBase}/${beatmap.beatmapFilename}`,
        bgUrl: `${beatmapBase}/${beatmap.bgFilename}`,
        bgColor: beatmap.bgColor,
      },
      mediaPath: SERVE_MEDIA_PATH,
    };
  });

function ScorePage() {
  const { score, player, beatmap, mediaPath } = Route.useLoaderData();
  const { scoreId } = Route.useParams();
  const autoplay = useRouterState({
    select: (s) => s.location.state?.autoplay ?? false,
  });

  useEffect(() => {
    fetch(`/api/score/${scoreId}/view`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, [scoreId]);

  return (
    <>
      {beatmap.bgColor && (
        <style dangerouslySetInnerHTML={{ __html: accentVarsToCss(beatmap.bgColor) }} />
      )}
      <Box width="100%" py="6">
        <Flex
          align={{ initial: "start", sm: "center" }}
          justify="between"
          gap="4"
          mb="4"
          wrap="wrap"
        >
          <Box minWidth="0" flexGrow="1">
            <Flex align="baseline" gap="2">
              <a
                href={`https://osu.ppy.sh/beatmapsets/${beatmap.beatmapSetId}#osu/${beatmap.beatmapId}`}
              >
                <Text size="7" weight="medium" truncate>
                  {beatmap.title}
                </Text>
              </a>
              <Text size="3" color="gray" mt="1" truncate>
                {beatmap.artist}
              </Text>
            </Flex>
            <Flex gap="1" align="center">
              <Text size="2" color="gray">
                played by
              </Text>
              <UserBadge
                userId={player.id}
                username={player.username}
                avatarUrl={player.avatarUrl}
              />
              <Text size="2" color="gray">
                mapped by
              </Text>
              <UserBadge userId={beatmap.creator} username={beatmap.creator} />
            </Flex>
          </Box>
          <Badge size="3" radius="full" variant="soft">
            {beatmap.version}
          </Badge>
        </Flex>

        <Box mb="5">
          <ReplayViewer
            scoreId={score.id}
            beatmapUrl={beatmap.beatmapUrl}
            beatmapSetId={beatmap.beatmapSetId}
            bgUrl={beatmap.bgUrl}
            simulation={score.simulation}
            rawMods={score.mods}
            autoplay={autoplay}
            mediaPath={mediaPath}
          />
        </Box>

        <Comments scoreId={scoreId} />
      </Box>
    </>
  );
}

export const Route = createFileRoute("/score/$scoreId")({
  validateSearch: zodValidator(searchSchema),
  loader: async ({ params }) => getScoreData({ data: params.scoreId }),
  staleTime: Infinity,
  pendingComponent: () => (
    <Flex width="100%" height="384px" align="center" justify="center" gap="3">
      <Spinner size="3" />
      <Text size="4" color="gray">
        Loading beatmap data...
      </Text>
    </Flex>
  ),
  errorComponent: ({ error }) => (
    <Flex width="100%" height="384px" align="center" justify="center">
      <Text size="4" color="red">
        {error instanceof Error ? error.message : "Something went wrong"}
      </Text>
    </Flex>
  ),
  component: ScorePage,
});
