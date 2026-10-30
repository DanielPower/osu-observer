import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Avatar,
  Box,
  Card,
  Flex,
  Heading,
  Link as RadixLink,
  Skeleton,
  Text,
} from "@radix-ui/themes";
import { Countdown } from "./Countdown";
import { SPEEDRUN_KIND_LABELS, formatPp, speedrunTitle } from "../lib/speedrun-labels";
import type { SpeedrunKind } from "../lib/speedrun-periods";
import type { SpeedrunStanding, SpeedrunSummary } from "../lib/speedrun-standings";

type CurrentSpeedrun = SpeedrunSummary & { standings: SpeedrunStanding[] };

const PODIUM_COLORS = ["#ffd75e", "#d6dbe4", "#ffb38a"];

export function LiveSpeedruns() {
  const current = useQuery<CurrentSpeedrun[]>({
    queryKey: ["speedruns", "current"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const res = await fetch("/api/speedruns/current");
      if (!res.ok) throw new Error("Failed to load speedruns");
      return res.json();
    },
  });

  if (current.isError) return null;

  return (
    <Flex direction="column" gap="3">
      <Flex align="center" justify="between" gap="3">
        <Heading as="h2" size="4">
          Live speedruns
        </Heading>
        <RadixLink asChild size="2">
          <Link to="/speedruns">All speedruns</Link>
        </RadixLink>
      </Flex>
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {current.data
          ? current.data.map((run) => <SpeedrunCard key={run.kind} run={run} />)
          : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} height="200px" />)}
      </Box>
    </Flex>
  );
}

function SpeedrunCard({ run }: { run: CurrentSpeedrun }) {
  const kind = run.kind as SpeedrunKind;
  return (
    <Card asChild size="2" className="tinted-card">
      <Link to="/speedruns/$kind/$key" params={{ kind, key: run.key }} style={{ color: "inherit" }}>
        <Flex direction="column" gap="3">
          <Flex justify="between" align="start" gap="3">
            <Flex direction="column" minWidth="0">
              <Text size="4" weight="bold">
                {SPEEDRUN_KIND_LABELS[kind]}
              </Text>
              <Text size="2" color="gray" truncate>
                {speedrunTitle(kind, run.key, new Date(run.startsAt), new Date(run.endsAt))}
              </Text>
            </Flex>
            <Flex direction="column" align="end" flexShrink="0">
              <Text size="1" color="gray">
                Ends in
              </Text>
              <Text size="3" weight="bold">
                <Countdown until={run.endsAt} />
              </Text>
            </Flex>
          </Flex>
          <Flex direction="column" gap="2">
            {run.standings.length === 0 ? (
              <Text size="2" color="gray">
                No plays yet.
              </Text>
            ) : (
              run.standings.map((s) => (
                <Flex key={s.userId} align="center" gap="2">
                  <Text
                    size="2"
                    weight="bold"
                    className="tabular"
                    style={{ width: 16, color: PODIUM_COLORS[s.rank - 1] }}
                  >
                    {s.rank}
                  </Text>
                  <Avatar
                    src={s.avatarUrl}
                    fallback={s.username[0]?.toUpperCase() ?? "?"}
                    size="1"
                    radius="full"
                  />
                  <Text size="2" truncate style={{ flexGrow: 1 }}>
                    {s.username}
                  </Text>
                  <Text size="2" weight="bold" className="tabular">
                    {formatPp(s.totalPp)}pp
                  </Text>
                </Flex>
              ))
            )}
          </Flex>
          <Text size="1" color="gray">
            {run.playerCount.toLocaleString()} {run.playerCount === 1 ? "player" : "players"}
          </Text>
        </Flex>
      </Link>
    </Card>
  );
}
