import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Box,
  Card,
  Flex,
  Grid,
  Heading,
  Spinner,
  Text,
} from "@radix-ui/themes";
import { useEffect } from "react";
import { z } from "zod";
import { ReplayViewer } from "../../components/ReplayViewer";
import { Comments } from "../../components/Comments";
import { useSetDynamicAccent } from "../../lib/dynamicAccentContext";

const searchSchema = z.object({
  skin: z.string().default("default"),
});

const API_URL = import.meta.env.VITE_API_URL || "/api";

type ScoreData = {
  scoreId: string;
  username: string;
  beatmapId: number;
  beatmap: {
    id: number;
    beatmapSetId: number;
    title: string;
    artist: string;
    creator: string;
    version: string;
  };
};

function ScorePage() {
  const { scoreId } = Route.useParams();
  const setBgUrl = useSetDynamicAccent();

  useEffect(() => {
    return () => setBgUrl(null);
  }, [setBgUrl]);

  useEffect(() => {
    fetch(`${API_URL}/score/${scoreId}/view`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, [scoreId]);

  const { data, isLoading, error } = useQuery<ScoreData>({
    queryKey: ["score", scoreId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/score/${scoreId}`);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to fetch score");
      }
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Flex width="100%" height="384px" align="center" justify="center" gap="3">
        <Spinner size="3" />
        <Text size="4" color="gray">
          Loading beatmap data...
        </Text>
      </Flex>
    );
  }

  if (error) {
    return (
      <Flex width="100%" height="384px" align="center" justify="center">
        <Text size="4" color="red">
          {error.message}
        </Text>
      </Flex>
    );
  }

  if (!data) return null;

  return (
    <Box width="100%" py="6">
      <Flex direction="column" align="center" gap="2" mb="5">
        <Heading
          size="8"
          align="center"
          style={{
            background:
              "linear-gradient(135deg, var(--accent-12), var(--accent-10))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {data.beatmap.title}
        </Heading>
        <Text size="5" color="gray">
          {data.beatmap.artist}
        </Text>
        <Badge size="2" radius="full" variant="soft">
          {data.beatmap.version}
        </Badge>
      </Flex>

      <Box mb="5">
        <ReplayViewer
          scoreId={data.scoreId}
          beatmapId={`${data.beatmap.id}`}
          beatmapSetId={`${data.beatmap.beatmapSetId}`}
          onBackgroundUrl={setBgUrl}
        />
      </Box>

      <Box mb="5">
        <Comments scoreId={scoreId} />
      </Box>

      <Card
        size="3"
        style={{
          backgroundImage:
            "linear-gradient(180deg, var(--accent-a3), var(--accent-a2))",
          borderColor: "var(--accent-a6)",
        }}
      >
        <Heading size="5" mb="4">
          Replay Information
        </Heading>
        <Grid columns={{ initial: "1", md: "2" }} gap="3">
          <Card variant="surface">
            <Text as="div" size="1" color="gray" mb="1">
              Player
            </Text>
            <Text as="div" size="3" weight="bold">
              {data.username}
            </Text>
          </Card>
          <Card variant="surface">
            <Text as="div" size="1" color="gray" mb="1">
              Score ID
            </Text>
            <Text as="div" size="3" weight="bold">
              {data.scoreId}
            </Text>
          </Card>
          <Card variant="surface">
            <Text as="div" size="1" color="gray" mb="1">
              Beatmap Set ID
            </Text>
            <Text as="div" size="3" weight="bold">
              {data.beatmap.beatmapSetId}
            </Text>
          </Card>
          <Card variant="surface">
            <Text as="div" size="1" color="gray" mb="1">
              Mapper
            </Text>
            <Text as="div" size="3" weight="bold">
              {data.beatmap.creator}
            </Text>
          </Card>
        </Grid>
      </Card>
    </Box>
  );
}

export const Route = createFileRoute("/score/$scoreId")({
  validateSearch: zodValidator(searchSchema),
  component: ScorePage,
});
