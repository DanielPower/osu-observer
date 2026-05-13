import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Button, Card, Flex, Grid, Heading, Spinner, Text, TextField } from "@radix-ui/themes";
import { RocketIcon } from "@radix-ui/react-icons";
import { useAuth } from "../hooks/useAuth";
import { ScoreCard } from "../components/ScoreCard";

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

type RecentScore = {
  scoreId: string;
  replayAvailable: boolean;
  rank: string;
  accuracy: number;
  pp: number | null;
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
  const [scoreId, setScoreId] = useState("");
  const { data: user } = useAuth();

  const trending = useQuery<TrendingEntry[]>({
    queryKey: ["scores", "trending"],
    queryFn: async () => {
      const res = await fetch(`/api/scores/trending?days=7&limit=10`);
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
    const trimmed = scoreId.trim();
    if (trimmed) {
      navigate({
        to: "/score/$scoreId",
        params: { scoreId: trimmed },
        state: { autoplay: true },
      });
    }
  };

  return (
    <Flex width="100%" flexGrow="1" direction="column" align="center" py="9" px="4" gap="8">
      <Flex direction="column" align="center" gap="6" width="100%">
        <Card
          size="3"
          style={{
            width: "100%",
            maxWidth: 480,
            backgroundImage: "linear-gradient(180deg, var(--accent-a3), var(--accent-a2))",
            borderColor: "var(--accent-a6)",
          }}
        >
          <form onSubmit={handleSubmit}>
            <Flex direction="column" gap="3">
              <Box>
                <Text as="label" htmlFor="score-id" size="2" color="gray" mb="1">
                  Score ID
                </Text>
                <TextField.Root
                  id="score-id"
                  size="3"
                  value={scoreId}
                  onChange={(e) => setScoreId(e.target.value)}
                  placeholder="e.g. 123456789"
                  autoFocus
                />
              </Box>
              <Button type="submit" size="3" variant="solid" disabled={!scoreId.trim()}>
                <RocketIcon />
                View Replay
              </Button>
            </Flex>
          </form>
        </Card>
      </Flex>

      <Grid
        columns={{ initial: "1", md: user ? "2" : "1" }}
        gap="6"
        width="100%"
        style={{ maxWidth: 960 }}
      >
        <Section
          title="Trending this week"
          isLoading={trending.isLoading}
          isEmpty={!trending.isLoading && (trending.data?.length ?? 0) === 0}
          emptyText="No trending replays yet — be the first to view one."
        >
          {trending.data?.map((s) => (
            <ScoreCard
              key={s.scoreId}
              scoreId={s.scoreId}
              title={s.title}
              artist={s.artist}
              version={s.version}
              username={s.username}
              userAvatarUrl={s.userAvatarUrl}
              beatmapSetId={s.beatmapSetId}
              trailing={
                <Text size="1" color="gray">
                  {s.viewCount} {s.viewCount === 1 ? "view" : "views"}
                </Text>
              }
            />
          ))}
        </Section>

        {user && (
          <Section
            title="Your recent plays"
            isLoading={recent.isLoading}
            isEmpty={!recent.isLoading && recentWithReplay.length === 0}
            emptyText={
              recent.data && recent.data.length > 0
                ? "None of your recent plays have a downloadable replay."
                : "No recent plays found."
            }
          >
            {recentWithReplay.map((s) => (
              <ScoreCard
                key={s.scoreId}
                scoreId={s.scoreId}
                title={s.title}
                artist={s.artist}
                version={s.version}
                username={s.user.username}
                userAvatarUrl={s.user.avatarUrl}
                beatmapSetId={s.beatmapSetId}
                coverUrl={s.coverList}
                trailing={
                  <Flex direction="column" align="end" gap="0">
                    <Text size="2" weight="bold">
                      {s.rank}
                    </Text>
                    <Text size="1" color="gray">
                      {(s.accuracy * 100).toFixed(2)}%
                    </Text>
                  </Flex>
                }
              />
            ))}
          </Section>
        )}
      </Grid>
    </Flex>
  );
}

function Section({
  title,
  subtitle,
  isLoading,
  isEmpty,
  emptyText,
  children,
}: {
  title: string;
  subtitle?: string;
  isLoading: boolean;
  isEmpty: boolean;
  emptyText: string;
  children?: React.ReactNode;
}) {
  return (
    <Flex direction="column" gap="3">
      <Box>
        <Heading size="4">{title}</Heading>
        {subtitle && (
          <Text size="2" color="gray">
            {subtitle}
          </Text>
        )}
      </Box>
      {isLoading ? (
        <Flex align="center" gap="2" p="3">
          <Spinner size="2" />
          <Text size="2" color="gray">
            Loading...
          </Text>
        </Flex>
      ) : isEmpty ? (
        <Card variant="surface">
          <Text size="2" color="gray">
            {emptyText}
          </Text>
        </Card>
      ) : (
        <Flex direction="column" gap="2">
          {children}
        </Flex>
      )}
    </Flex>
  );
}
