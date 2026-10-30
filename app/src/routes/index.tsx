import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Link as RadixLink,
  SegmentedControl,
  Skeleton,
  Text,
} from "@radix-ui/themes";
import { PlayIcon } from "@radix-ui/react-icons";
import { useAuth } from "../hooks/useAuth";
import { ScoreRow } from "../components/ScoreRow";
import { ModChips } from "../components/GradeBadge";
import { parseScoreInput } from "../lib/score-input";

export const Route = createFileRoute("/")({
  component: Index,
});

type TrendingEntry = {
  scoreId: string;
  username: string;
  userAvatarUrl?: string;
  beatmapSetId: number;
  title: string;
  artist: string;
  version: string;
  creator: string;
  viewCount: number;
};

type LatestScore = {
  scoreId: string;
  endedAt: string;
  username: string;
  userAvatarUrl: string;
  beatmapSetId: number;
  title: string;
  artist: string;
  version: string;
  starRating: number;
  // Score stats are optional so rows still render before the feed stores them.
  rank?: string | null;
  accuracy?: number | null;
  pp?: number | null;
  mods?: string[] | null;
};

type RecentScore = {
  scoreId: string;
  replayAvailable: boolean;
  rank: string;
  accuracy: number;
  pp: number | null;
  mods: string[];
  user: { id: number; username: string; avatarUrl: string };
  beatmapSetId: number;
  title: string;
  artist: string;
  version: string;
  creator: string;
  coverList?: string;
};

function Index() {
  const navigate = useNavigate();
  const [scoreInput, setScoreInput] = useState("");
  const [feed, setFeed] = useState<"latest" | "trending">("latest");
  const { data: user } = useAuth();
  const scoreId = parseScoreInput(scoreInput);
  const showInputError = scoreInput.trim() !== "" && !scoreId;

  const latest = useQuery<LatestScore[]>({
    queryKey: ["scores", "latest"],
    refetchInterval: 10_000,
    enabled: feed === "latest",
    queryFn: async () => {
      const res = await fetch(`/api/scores/latest?limit=15`);
      if (!res.ok) throw new Error("Failed to load latest scores");
      return res.json();
    },
  });

  const trending = useQuery<TrendingEntry[]>({
    queryKey: ["scores", "trending"],
    enabled: feed === "trending",
    queryFn: async () => {
      const res = await fetch(`/api/scores/trending?days=7&limit=15`);
      if (!res.ok) throw new Error("Failed to load trending scores");
      return res.json();
    },
  });

  const recent = useQuery<RecentScore[]>({
    queryKey: ["scores", "me", "recent"],
    enabled: Boolean(user),
    queryFn: async () => {
      const res = await fetch(`/api/scores/me/recent?limit=20`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load recent scores");
      return res.json();
    },
  });

  const recentWithReplay = recent.data?.filter((s) => s.replayAvailable) ?? [];

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (scoreId) {
      navigate({
        to: "/score/$scoreId",
        params: { scoreId },
        state: { autoplay: true },
      });
    }
  };

  const activeFeed = feed === "latest" ? latest : trending;

  return (
    <Flex width="100%" flexGrow="1" direction="column" py="8" gap="8">
      <Flex direction="column" align="center" gap="4" style={{ textAlign: "center" }}>
        <Heading as="h1" size={{ initial: "8", sm: "9" }} weight="bold" style={{ maxWidth: 720 }}>
          Watch any osu! replay, right in your browser.
        </Heading>
        <Text size="4" color="gray" style={{ maxWidth: 560 }}>
          Paste a score link, pick a skin, and step through it frame by frame.
        </Text>
        <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 640, marginTop: 8 }}>
          <div className="score-input">
            <label htmlFor="score-id" className="visually-hidden">
              Score link or ID
            </label>
            <input
              id="score-id"
              value={scoreInput}
              onChange={(e) => setScoreInput(e.target.value)}
              placeholder="osu.ppy.sh/scores/1234567890 or a score ID"
              autoComplete="off"
              aria-invalid={showInputError}
              aria-describedby="score-id-help"
            />
            <Button type="submit" size="3" radius="full" disabled={!scoreId}>
              <PlayIcon />
              Watch
            </Button>
          </div>
        </form>
        <Text id="score-id-help" size="2" color={showInputError ? "red" : "gray"}>
          {showInputError
            ? "That doesn't look like a score link. It should contain /scores/ followed by a number."
            : "On osu.ppy.sh, open a score that has a replay and copy its URL."}
        </Text>
      </Flex>

      <Flex gap="6" wrap="wrap" align="start">
        <Flex direction="column" gap="3" style={{ flex: "999 1 560px", minWidth: 0 }}>
          <Flex align="center" justify="between" gap="3" wrap="wrap">
            <SegmentedControl.Root
              value={feed}
              onValueChange={(value) => setFeed(value as "latest" | "trending")}
              radius="full"
              size="2"
            >
              <SegmentedControl.Item value="latest">Latest scores</SegmentedControl.Item>
              <SegmentedControl.Item value="trending">Trending this week</SegmentedControl.Item>
            </SegmentedControl.Root>
            {feed === "latest" && (
              <Flex align="center" gap="2">
                <Box
                  width="8px"
                  height="8px"
                  style={{ borderRadius: "50%", backgroundColor: "var(--green-9)" }}
                />
                <Text size="2" color="gray">
                  Updates live
                </Text>
              </Flex>
            )}
          </Flex>

          <Card size="1" className="tinted-card" style={{ padding: 0, overflow: "hidden" }}>
            {activeFeed.isLoading ? (
              <RowSkeletons count={6} />
            ) : activeFeed.isError ? (
              <EmptyState text="Couldn't load scores. Try again in a moment." />
            ) : feed === "latest" ? (
              latest.data?.length ? (
                latest.data.map((s) => (
                  <ScoreRow
                    key={s.scoreId}
                    scoreId={s.scoreId}
                    title={s.title}
                    version={s.version}
                    starRating={s.starRating}
                    username={s.username}
                    userAvatarUrl={s.userAvatarUrl}
                    beatmapSetId={s.beatmapSetId}
                    meta={timeAgo(s.endedAt)}
                    rank={s.rank ?? undefined}
                    trailing={<FeedStats score={s} />}
                  />
                ))
              ) : (
                <EmptyState text="No scores yet. New plays show up here as they're set." />
              )
            ) : trending.data?.length ? (
              trending.data.map((s) => (
                <ScoreRow
                  key={s.scoreId}
                  scoreId={s.scoreId}
                  title={s.title}
                  version={s.version}
                  username={s.username}
                  userAvatarUrl={s.userAvatarUrl}
                  beatmapSetId={s.beatmapSetId}
                  meta={`${s.viewCount.toLocaleString()} ${s.viewCount === 1 ? "view" : "views"}`}
                />
              ))
            ) : (
              <EmptyState text="Nothing trending yet. Watch a replay and it'll show up here." />
            )}
          </Card>
        </Flex>

        <Flex direction="column" gap="3" style={{ flex: "1 1 300px", minWidth: 0 }}>
          <Heading as="h2" size="4" style={{ lineHeight: "32px" }}>
            Your recent plays
          </Heading>
          {user ? (
            <Card size="1" className="tinted-card" style={{ padding: 0, overflow: "hidden" }}>
              {recent.isLoading ? (
                <RowSkeletons count={4} />
              ) : recentWithReplay.length === 0 ? (
                <EmptyState
                  text={
                    recent.data && recent.data.length > 0
                      ? "None of your recent plays have a replay to watch."
                      : "No recent plays found."
                  }
                />
              ) : (
                recentWithReplay.map((s) => (
                  <ScoreRow
                    key={s.scoreId}
                    scoreId={s.scoreId}
                    title={s.title}
                    version={s.version}
                    username={s.user.username}
                    userAvatarUrl={s.user.avatarUrl}
                    beatmapSetId={s.beatmapSetId}
                    coverUrl={s.coverList}
                    rank={s.rank}
                    meta={`${(s.accuracy * 100).toFixed(2)}%`}
                    trailing={<ModChips mods={s.mods.filter((m) => m !== "CL")} />}
                  />
                ))
              )}
            </Card>
          ) : (
            <Card size="3" className="tinted-card">
              <Flex direction="column" gap="3" align="start">
                <Text size="3" color="gray">
                  Log in with your osu! account to see your latest plays here and watch them back in
                  one click.
                </Text>
                <Button asChild variant="soft" radius="full">
                  <a href="/api/auth/login">Log in with osu!</a>
                </Button>
              </Flex>
            </Card>
          )}
          <Text size="2" color="gray">
            See what&apos;s new in the{" "}
            <RadixLink asChild>
              <a href="/changelog">changelog</a>
            </RadixLink>
            .
          </Text>
        </Flex>
      </Flex>
    </Flex>
  );
}

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function timeAgo(iso: string) {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (seconds > -60) return relativeTime.format(seconds, "second");
  if (seconds > -3600) return relativeTime.format(Math.round(seconds / 60), "minute");
  if (seconds > -86400) return relativeTime.format(Math.round(seconds / 3600), "hour");
  return relativeTime.format(Math.round(seconds / 86400), "day");
}

function FeedStats({ score }: { score: LatestScore }) {
  const mods = (score.mods ?? []).filter((mod) => mod !== "CL");
  const hasAccuracy = typeof score.accuracy === "number";
  const hasPp = typeof score.pp === "number";
  if (!hasAccuracy && !hasPp && mods.length === 0) return null;
  return (
    <Flex align="center" gap="3">
      <Box display={{ initial: "none", sm: "block" }}>
        <ModChips mods={mods} />
      </Box>
      <Flex direction="column" align="end" style={{ minWidth: 64 }}>
        {hasPp && (
          <Text size="3" weight="bold" className="tabular">
            {Math.round(score.pp!).toLocaleString()}
            <Text size="1" color="gray" weight="medium">
              pp
            </Text>
          </Text>
        )}
        {hasAccuracy && (
          <Text size="1" color="gray" className="tabular">
            {(score.accuracy! * 100).toFixed(2)}%
          </Text>
        )}
      </Flex>
    </Flex>
  );
}

function RowSkeletons({ count }: { count: number }) {
  return (
    <Flex direction="column">
      {Array.from({ length: count }, (_, i) => (
        <Flex key={i} align="center" gap="3" px="3" py="2">
          <Skeleton width="80px" height="52px" />
          <Flex direction="column" gap="2" flexGrow="1">
            <Skeleton height="16px" width="60%" />
            <Skeleton height="14px" width="35%" />
          </Flex>
        </Flex>
      ))}
    </Flex>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Box p="4">
      <Text size="2" color="gray">
        {text}
      </Text>
    </Box>
  );
}
