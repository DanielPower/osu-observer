import { Link } from "@tanstack/react-router";
import { Avatar, Badge, Box, Card, Flex, Text } from "@radix-ui/themes";

export type ScoreCardProps = {
  scoreId: string;
  title: string;
  artist: string;
  version: string;
  username: string;
  userAvatarUrl?: string;
  beatmapSetId: number;
  coverUrl?: string;
  trailing?: React.ReactNode;
};

const beatmapsetCoverUrl = (beatmapSetId: number) =>
  `https://assets.ppy.sh/beatmaps/${beatmapSetId}/covers/list@2x.jpg`;

export function ScoreCard({
  scoreId,
  title,
  artist,
  version,
  username,
  userAvatarUrl,
  beatmapSetId,
  coverUrl,
  trailing,
}: ScoreCardProps) {
  const cover = coverUrl ?? beatmapsetCoverUrl(beatmapSetId);

  return (
    <Link
      to="/score/$scoreId"
      params={{ scoreId }}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <Card
        size="2"
        style={{
          transition: "transform 150ms ease, border-color 150ms ease",
        }}
      >
        <Flex gap="3" align="center">
          <Box
            style={{
              width: 80,
              height: 60,
              flexShrink: 0,
              borderRadius: "var(--radius-2)",
              overflow: "hidden",
              backgroundColor: "var(--gray-3)",
              backgroundImage: `url(${cover})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <Flex direction="column" flexGrow="1" gap="1" minWidth="0">
            <Text size="2" weight="bold" truncate>
              {title}
            </Text>
            <Text size="1" color="gray" truncate>
              {artist}
            </Text>
            <Flex align="center" gap="2">
              <Badge size="1" variant="soft" radius="full">
                {version}
              </Badge>
              <Flex align="center" gap="1" minWidth="0">
                {userAvatarUrl && (
                  <Avatar
                    src={userAvatarUrl}
                    fallback={username[0]?.toUpperCase() ?? "?"}
                    size="1"
                    radius="full"
                  />
                )}
                <Text size="1" color="gray" truncate>
                  {username}
                </Text>
              </Flex>
            </Flex>
          </Flex>
          {trailing && <Box flexShrink="0">{trailing}</Box>}
        </Flex>
      </Card>
    </Link>
  );
}
