import { Link } from "@tanstack/react-router";
import { Avatar, Box, Flex, Text } from "@radix-ui/themes";
import { GradeBadge } from "./GradeBadge";

export type ScoreRowProps = {
  scoreId: string;
  title: string;
  version: string;
  starRating?: number;
  username: string;
  userAvatarUrl?: string;
  beatmapSetId: number;
  coverUrl?: string;
  rank?: string;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
};

const beatmapsetCoverUrl = (beatmapSetId: number) =>
  `https://assets.ppy.sh/beatmaps/${beatmapSetId}/covers/list@2x.jpg`;

export function ScoreRow({
  scoreId,
  title,
  version,
  starRating,
  username,
  userAvatarUrl,
  beatmapSetId,
  coverUrl,
  rank,
  meta,
  trailing,
}: ScoreRowProps) {
  const cover = coverUrl ?? beatmapsetCoverUrl(beatmapSetId);

  return (
    <Link
      to="/score/$scoreId"
      params={{ scoreId }}
      state={{ autoplay: true }}
      className="score-row"
      style={{ color: "inherit" }}
    >
      <Flex align="center" gap="3" px="3" py="2">
        {rank && <GradeBadge rank={rank} size={40} />}
        <Box
          width="80px"
          height="52px"
          flexShrink="0"
          style={{
            borderRadius: "var(--radius-3)",
            backgroundColor: "var(--gray-a3)",
            backgroundImage: `url(${cover})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <Flex direction="column" flexGrow="1" gap="1" minWidth="0">
          <Flex align="baseline" gap="2" minWidth="0">
            <Text size="3" weight="medium" truncate style={{ minWidth: "6em" }}>
              {title}
            </Text>
            <Text size="2" color="gray" truncate style={{ flexShrink: 2, minWidth: "4em" }}>
              [{version}]
            </Text>
            {starRating !== undefined && (
              <Text size="1" className="tabular" style={{ color: "#ffd75e", whiteSpace: "nowrap" }}>
                ★ {starRating.toFixed(2)}
              </Text>
            )}
          </Flex>
          <Flex align="center" gap="2" minWidth="0">
            <Avatar
              src={userAvatarUrl}
              fallback={username[0]?.toUpperCase() ?? "?"}
              size="1"
              radius="full"
            />
            <Text size="2" weight="medium" truncate style={{ color: "var(--gray-12)" }}>
              {username}
            </Text>
            {meta && (
              <Text size="2" color="gray" style={{ whiteSpace: "nowrap" }}>
                · {meta}
              </Text>
            )}
          </Flex>
        </Flex>
        {trailing && <Box flexShrink="0">{trailing}</Box>}
      </Flex>
    </Link>
  );
}
