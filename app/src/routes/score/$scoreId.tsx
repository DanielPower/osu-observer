import { createFileRoute, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import { Box, Button, Flex, Heading, Link as RadixLink, Spinner, Text } from "@radix-ui/themes";
import { CheckIcon, CrossCircledIcon, ExternalLinkIcon, Link2Icon } from "@radix-ui/react-icons";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ReplayViewer, type PlayerHandle } from "../../components/ReplayViewer";
import { Comments } from "../../components/Comments";
import { ScoreSummaryStrip } from "../../components/ScoreSummaryStrip";
import { accentVarsToCss } from "../../lib/accentVars";
import {
  loadScorePageData,
  loadStoredScorePageData,
  type ScorePageData,
} from "../../lib/score-page-data";
import { judgementMarks, summarizeSimulation } from "../../lib/score-summary";
import { useSimulation } from "../../hooks/useSimulation";
import {
  previewMeta,
  scorePreviewDescription,
  scorePreviewTitle,
  SITE_NAME,
} from "../../lib/link-preview";

const searchSchema = z.object({
  t: z.number().nonnegative().optional(),
});

const getScoreData = createServerFn({ method: "GET" })
  .inputValidator((scoreId: string) => scoreId)
  .handler(async ({ data: scoreId }) => {
    try {
      return await loadScorePageData(scoreId);
    } catch (error) {
      console.error(`[score/${scoreId}] Failed to load score page`, error);
      throw error;
    }
  });

// For link hover preloads: only what's already stored, so moving the mouse over the app never
// calls the osu! API or a beatmap mirror. Null means the score still has to be fetched.
const getStoredScoreData = createServerFn({ method: "GET" })
  .inputValidator((scoreId: string) => scoreId)
  .handler(({ data: scoreId }) => loadStoredScorePageData(scoreId));

function ShareButton({ scoreId, currentTime }: { scoreId: string; currentTime: () => number }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function share() {
    const url = new URL(`/score/${scoreId}`, window.location.origin);
    const seconds = Math.floor(currentTime());
    if (seconds > 0) url.searchParams.set("t", String(seconds));
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
    } catch {
      window.prompt("Copy this link", url.toString());
    }
  }

  return (
    <Button variant="soft" color="gray" radius="full" onClick={share}>
      {copied ? <CheckIcon /> : <Link2Icon />}
      {copied ? "Link copied" : "Copy link"}
    </Button>
  );
}

function ScoreRoute() {
  const data = Route.useLoaderData();
  const { scoreId } = Route.useParams();
  const router = useRouter();

  // A hover preload of a score that isn't stored yet leaves no data. Once the score is
  // actually opened, run the full load, which fetches it from osu!.
  useEffect(() => {
    if (data) return;
    void router.invalidate({
      filter: (match) => match.routeId === Route.id && match.params.scoreId === scoreId,
    });
  }, [data, router, scoreId]);

  return data ? <ScorePage data={data} /> : <PendingScore />;
}

function ScorePage({ data }: { data: ScorePageData }) {
  const { score, player, beatmap, mediaPath, skins } = data;
  const { scoreId } = Route.useParams();
  const { t } = Route.useSearch();
  const autoplay = useRouterState({
    select: (s) => s.location.state?.autoplay ?? false,
  });
  const playerRef = useRef<PlayerHandle | null>(null);

  useEffect(() => {
    fetch(`/api/score/${scoreId}/view`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, [scoreId]);

  const simulation = useSimulation({
    replayUrl: score.replayUrl,
    beatmapUrl: beatmap.beatmapUrl,
    mods: score.mods,
  });
  const summary =
    simulation.simulation && summarizeSimulation(simulation.simulation, score.modAcronyms);
  const marks = simulation.simulation ? judgementMarks(simulation.simulation) : [];
  const visibleMods = score.modAcronyms.filter((mod) => mod !== "CL");
  const currentTime = () => playerRef.current?.currentTime() ?? 0;
  const seek = (seconds: number) => playerRef.current?.seek(seconds);

  return (
    <>
      {beatmap.bgColor && (
        <style dangerouslySetInnerHTML={{ __html: accentVarsToCss(beatmap.bgColor) }} />
      )}
      <Flex direction="column" gap="4" width="100%" py="6">
        <Flex align="center" gap="4" wrap="wrap">
          <Box
            width="120px"
            height="76px"
            flexShrink="0"
            display={{ initial: "none", sm: "block" }}
            style={{
              borderRadius: "var(--radius-4)",
              backgroundColor: "var(--gray-a3)",
              backgroundImage: `url(https://assets.ppy.sh/beatmaps/${beatmap.beatmapSetId}/covers/list@2x.jpg)`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <Flex direction="column" gap="1" style={{ flex: "1 1 360px", minWidth: 0 }}>
            <Heading as="h1" size={{ initial: "6", sm: "7" }} weight="bold">
              {beatmap.title}
            </Heading>
            <Flex align="center" gap="2" wrap="wrap">
              <Text size="3" color="gray">
                {beatmap.artist}
              </Text>
              <Text
                size="2"
                weight="bold"
                style={{
                  padding: "2px 12px",
                  borderRadius: 9999,
                  backgroundColor: "var(--accent-a4)",
                  color: "var(--accent-11)",
                }}
              >
                {beatmap.version}
              </Text>
              <Text size="3" color="gray">
                mapped by{" "}
                <RadixLink href={`https://osu.ppy.sh/users/${beatmap.creator}`} underline="hover">
                  {beatmap.creator}
                </RadixLink>
              </Text>
            </Flex>
          </Flex>
          <Flex gap="2" wrap="wrap">
            <ShareButton scoreId={scoreId} currentTime={currentTime} />
            <Button asChild variant="soft" color="gray" radius="full">
              <a
                href={`https://osu.ppy.sh/beatmapsets/${beatmap.beatmapSetId}#osu/${beatmap.beatmapId}`}
              >
                Open on osu!
                <ExternalLinkIcon />
              </a>
            </Button>
          </Flex>
        </Flex>

        {summary && <ScoreSummaryStrip summary={summary} mods={visibleMods} player={player} />}

        <ReplayViewer
          scoreId={score.id}
          beatmapUrl={beatmap.beatmapUrl}
          beatmapSetId={beatmap.beatmapSetId}
          bgUrl={beatmap.bgUrl}
          simulation={simulation.promise}
          mods={score.mods}
          autoplay={autoplay && t === undefined}
          initialTime={t}
          mediaPath={mediaPath}
          skins={skins}
          marks={marks}
          handleRef={playerRef}
        />

        {marks.length > 0 && (
          <Flex gap="4" wrap="wrap" align="center" px="1">
            <Legend color="#ff7b7b" height={14} label="Miss" />
            <Legend color="#ffb347" height={10} label="50" />
            <Legend color="#7fe08a" height={6} label="100" />
            <Text size="1" color="gray">
              Click a mark to jump to it.
            </Text>
          </Flex>
        )}

        <Box mt="2">
          <Comments scoreId={scoreId} onSeek={seek} currentTime={currentTime} />
        </Box>
      </Flex>
    </>
  );
}

function Legend({ color, height, label }: { color: string; height: number; label: string }) {
  return (
    <Flex align="center" gap="2">
      <span style={{ width: 3, height, borderRadius: 2, backgroundColor: color }} />
      <Text size="1" color="gray">
        {label}
      </Text>
    </Flex>
  );
}

function PendingScore() {
  return (
    <Flex width="100%" minHeight="420px" align="center" justify="center">
      <Flex
        direction="column"
        align="center"
        gap="3"
        style={{ maxWidth: 360, textAlign: "center" }}
      >
        <Spinner size="3" />
        <Text size="4" weight="bold">
          Getting the replay ready
        </Text>
        <Text size="2" color="gray">
          If nobody has watched this score before, we fetch the replay and beatmap from osu! first.
          That can take up to a minute.
        </Text>
      </Flex>
    </Flex>
  );
}

function ScoreError({ error }: { error: unknown }) {
  const { scoreId } = Route.useParams();
  const message =
    error instanceof Error && error.message && error.message !== "Error"
      ? error.message
      : "osu! didn't return a replay for this score.";
  return (
    <Flex width="100%" minHeight="420px" align="center" justify="center">
      <Flex
        direction="column"
        align="center"
        gap="3"
        style={{ maxWidth: 420, textAlign: "center" }}
      >
        <CrossCircledIcon width="48" height="48" color="var(--red-9)" />
        <Heading as="h1" size="6">
          We couldn&apos;t load that replay
        </Heading>
        <Text size="3" color="gray">
          {message} Check that score {scoreId} exists and has a replay on osu!
        </Text>
        <Flex gap="2" mt="2" wrap="wrap" justify="center">
          <Button asChild radius="full">
            <Link to="/">Try another score</Link>
          </Button>
          <Button asChild variant="soft" color="gray" radius="full">
            <a href={`https://osu.ppy.sh/scores/${scoreId}`}>
              Open on osu!
              <ExternalLinkIcon />
            </a>
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}

export const Route = createFileRoute("/score/$scoreId")({
  validateSearch: zodValidator(searchSchema),
  // Hover preloads only read what's stored; the osu! API and beatmap mirrors are only called
  // once the score is opened.
  loader: ({ params, preload }) =>
    preload ? getStoredScoreData({ data: params.scoreId }) : getScoreData({ data: params.scoreId }),
  staleTime: Infinity,
  head: ({ loaderData, params }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.player.username} on ${loaderData.beatmap.title} · ${SITE_NAME}` },
          ...previewMeta({
            title: scorePreviewTitle(loaderData.player.username, loaderData.beatmap),
            description: scorePreviewDescription(
              loaderData.score.stats,
              loaderData.score.modAcronyms,
              loaderData.beatmap.creator,
            ),
            url: `${loaderData.siteUrl}/score/${params.scoreId}`,
            image: `${loaderData.siteUrl}/api/og/score/${params.scoreId}`,
            themeColor: loaderData.beatmap.bgColor,
          }),
        ]
      : [],
  }),
  pendingComponent: PendingScore,
  errorComponent: ({ error }) => <ScoreError error={error} />,
  component: ScoreRoute,
});
