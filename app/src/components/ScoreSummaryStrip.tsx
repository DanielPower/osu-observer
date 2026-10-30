import { Avatar, Flex, Link as RadixLink, Text } from "@radix-ui/themes";
import { GradeBadge, ModChips } from "./GradeBadge";
import type { ScoreSummary } from "../lib/score-summary";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Flex
      direction="column"
      gap="1"
      px="4"
      py="3"
      style={{ flex: "1 1 110px", borderLeft: "1px solid var(--gray-a4)" }}
    >
      <Text
        size="1"
        weight="bold"
        color="gray"
        style={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
      >
        {label}
      </Text>
      <Text size="5" weight="bold" className="tabular">
        {children}
      </Text>
    </Flex>
  );
}

export function ScoreSummaryStrip({
  summary,
  mods,
  player,
}: {
  summary: ScoreSummary;
  mods: string[];
  player: { id: number; username: string; avatarUrl: string };
}) {
  return (
    <Flex
      wrap="wrap"
      style={{
        borderRadius: "var(--radius-5)",
        border: "1px solid var(--gray-a4)",
        backgroundColor: "var(--gray-a2)",
        overflow: "hidden",
      }}
    >
      <Flex align="center" gap="3" px="4" py="3" style={{ flex: "1 1 220px" }}>
        <GradeBadge rank={summary.grade} size={52} />
        <Flex direction="column" gap="1" minWidth="0">
          <Text size="1" color="gray">
            Played by
          </Text>
          <RadixLink
            href={`https://osu.ppy.sh/users/${player.id}`}
            color="gray"
            highContrast
            underline="hover"
            weight="bold"
            size="3"
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}
          >
            <Avatar
              src={player.avatarUrl}
              alt=""
              fallback={player.username[0] ?? "?"}
              size="1"
              radius="full"
            />
            {player.username}
          </RadixLink>
        </Flex>
      </Flex>
      <Stat label="Score">{summary.score.toLocaleString()}</Stat>
      <Stat label="Accuracy">{(summary.accuracy * 100).toFixed(2)}%</Stat>
      <Stat label="Max combo">{summary.maxCombo.toLocaleString()}x</Stat>
      <Stat label="Mods">
        {mods.length > 0 ? (
          <span style={{ display: "inline-block", paddingTop: 4 }}>
            <ModChips mods={mods} />
          </span>
        ) : (
          <Text color="gray">None</Text>
        )}
      </Stat>
      <Flex
        direction="column"
        gap="1"
        px="4"
        py="3"
        style={{ flex: "1 1 180px", borderLeft: "1px solid var(--gray-a4)" }}
      >
        <Text
          size="1"
          weight="bold"
          color="gray"
          style={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
        >
          Hits
        </Text>
        <Flex
          gap="3"
          className="tabular"
          style={{ fontSize: "var(--font-size-4)", fontWeight: 600 }}
        >
          <span style={{ color: "#7fd0ff" }} title="300s">
            {summary.great}
          </span>
          <span style={{ color: "#7fe08a" }} title="100s">
            {summary.ok}
          </span>
          <span style={{ color: "#ffb347" }} title="50s">
            {summary.meh}
          </span>
          <span style={{ color: "#ff7b7b" }} title="Misses">
            {summary.miss}✕
          </span>
        </Flex>
      </Flex>
    </Flex>
  );
}
