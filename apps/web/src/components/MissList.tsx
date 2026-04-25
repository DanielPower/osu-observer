import { Badge, Card, Flex, Heading } from "@radix-ui/themes";

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor(ms % 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

export function MissList({
  misses,
  onSeek,
}: {
  misses: { time: number }[];
  onSeek: (timeMs: number) => void;
}) {
  if (misses.length === 0) return null;

  return (
    <Card mt="2" size="2" style={{ backgroundColor: "var(--gray-2)" }}>
      <Heading size="2" color="gray" mb="2">
        Misses ({misses.length})
      </Heading>
      <Flex wrap="wrap" gap="1">
        {misses.map((miss, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSeek(miss.time)}
            style={{
              all: "unset",
              cursor: "pointer",
              borderRadius: "var(--radius-2)",
            }}
          >
            <Badge color="red" variant="soft" size="2" radius="medium">
              {formatTime(miss.time)}
            </Badge>
          </button>
        ))}
      </Flex>
    </Card>
  );
}
