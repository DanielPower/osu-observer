import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useQuery } from "@tanstack/react-query";
import {
  Avatar,
  Badge,
  Box,
  Flex,
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
  user: {
    id: number;
    username: string;
    avatarUrl: string;
  } | null;
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
  const autoplay = useRouterState({
    select: (s) => s.location.state?.autoplay ?? false,
  });

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
      <Flex
        align={{ initial: "start", sm: "center" }}
        justify="between"
        gap="4"
        mb="4"
        wrap="wrap"
      >
        <Box minWidth="0" flexGrow="1">
          <Heading
            size="7"
            style={{
              background:
                "linear-gradient(135deg, var(--accent-12), var(--accent-10))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              lineHeight: 1.1,
            }}
            truncate
          >
            {data.beatmap.title}
          </Heading>
          <Text as="div" size="3" color="gray" mt="1" truncate>
            {data.beatmap.artist}
          </Text>
          <Flex align="center" gap="2" mt="2" wrap="wrap">
            {data.user && (
              <Avatar
                src={data.user.avatarUrl}
                alt={data.user.username}
                fallback={data.user.username[0]?.toUpperCase() ?? "?"}
                size="1"
                radius="full"
              />
            )}
            <Text as="span" size="2" color="gray">
              played by{" "}
              <Text weight="bold" color={undefined}>
                {data.user?.username ?? data.username}
              </Text>{" "}
              · mapped by{" "}
              <Text weight="bold" color={undefined}>
                {data.beatmap.creator}
              </Text>
            </Text>
          </Flex>
        </Box>
        <Badge size="3" radius="full" variant="soft">
          {data.beatmap.version}
        </Badge>
      </Flex>

      <Box mb="5">
        <ReplayViewer
          scoreId={data.scoreId}
          beatmapId={`${data.beatmap.id}`}
          beatmapSetId={`${data.beatmap.beatmapSetId}`}
          onBackgroundUrl={setBgUrl}
          autoplay={autoplay}
        />
      </Box>

      <Comments scoreId={scoreId} />
    </Box>
  );
}

export const Route = createFileRoute("/score/$scoreId")({
  validateSearch: zodValidator(searchSchema),
  component: ScorePage,
});
