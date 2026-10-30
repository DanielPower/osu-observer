import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Avatar,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  IconButton,
  SegmentedControl,
  Skeleton,
  Text,
} from "@radix-ui/themes";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { useAuth } from "../../../hooks/useAuth";
import { Countdown } from "../../../components/Countdown";
import { GradeBadge, ModChips } from "../../../components/GradeBadge";
import {
  SPEEDRUN_KINDS,
  type SpeedrunKind,
  isSpeedrunKind,
  parseSpeedrunKey,
} from "../../../lib/speedrun-periods";
import { SPEEDRUN_KIND_LABELS, formatPp, speedrunTitle } from "../../../lib/speedrun-labels";
import type {
  SpeedrunPage,
  SpeedrunPlayRow,
  SpeedrunStanding,
} from "../../../lib/speedrun-standings";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/speedruns/$kind/$key")({
  params: {
    parse: ({ kind, key }) => {
      if (!isSpeedrunKind(kind) || !parseSpeedrunKey(kind, key)) throw notFound();
      return { kind: kind as SpeedrunKind, key };
    },
    stringify: ({ kind, key }) => ({ kind, key }),
  },
  head: ({ params }) => ({
    meta: [{ title: `${SPEEDRUN_KIND_LABELS[params.kind]} speedrun · osu!observer` }],
  }),
  component: SpeedrunRoute,
});

function SpeedrunRoute() {
  const { kind, key } = Route.useParams();
  // Keyed so paging and expanded rows reset when moving to another speedrun.
  return <Speedrun key={`${kind}/${key}`} kind={kind} speedrunKey={key} />;
}

function Speedrun({ kind, speedrunKey }: { kind: SpeedrunKind; speedrunKey: string }) {
  const navigate = useNavigate();
  const { data: user } = useAuth();
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  const page = useQuery<SpeedrunPage>({
    queryKey: ["speedrun", kind, speedrunKey, offset, user?.user_id ?? null],
    refetchInterval: (query) => (query.state.data?.live === false ? false : 10_000),
    queryFn: async () => {
      const res = await fetch(
        `/api/speedruns/${kind}/${speedrunKey}?offset=${offset}&limit=${PAGE_SIZE}`,
        {
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to load speedrun");
      return res.json();
    },
  });
  const data = page.data;

  return (
    <Flex width="100%" direction="column" py="8" gap="5">
      <Flex direction="column" gap="2">
        <Heading as="h1" size={{ initial: "8", sm: "9" }} weight="bold">
          Speedruns
        </Heading>
        <Text size="4" color="gray" style={{ maxWidth: 640 }}>
          Who gains the most pp before the clock runs out. Every play counts, best per map, weighted
          like your profile.
        </Text>
      </Flex>

      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <SegmentedControl.Root
          value={kind}
          onValueChange={(value) =>
            navigate({ to: "/speedruns/$kind", params: { kind: value as SpeedrunKind } })
          }
          radius="full"
          size="2"
        >
          {SPEEDRUN_KINDS.map((k) => (
            <SegmentedControl.Item key={k} value={k}>
              {SPEEDRUN_KIND_LABELS[k]}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
        {data?.live ? (
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
        ) : (
          data && (
            <Link to="/speedruns/$kind" params={{ kind }}>
              <Text size="2" color="pink">
                Back to the live speedrun
              </Text>
            </Link>
          )
        )}
      </Flex>

      <Card size="3" className="tinted-card">
        <Flex align="center" justify="between" gap="5" wrap="wrap">
          <Flex align="center" gap="4">
            {data && (
              <IconButton asChild variant="soft" color="gray" radius="full" size="3">
                <Link
                  to="/speedruns/$kind/$key"
                  params={{ kind, key: data.previousKey }}
                  aria-label="Previous speedrun"
                >
                  <ChevronLeftIcon />
                </Link>
              </IconButton>
            )}
            <Flex direction="column" gap="1">
              <Text
                size="1"
                weight="bold"
                color={data?.live ? "pink" : "gray"}
                style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
              >
                {SPEEDRUN_KIND_LABELS[kind]} · {data?.live ? "live" : "ended"}
              </Text>
              <Text size="6" weight="medium">
                {data
                  ? speedrunTitle(kind, data.key, new Date(data.startsAt), new Date(data.endsAt))
                  : speedrunKey}
              </Text>
            </Flex>
            {data?.nextKey && (
              <IconButton asChild variant="soft" color="gray" radius="full" size="3">
                <Link
                  to="/speedruns/$kind/$key"
                  params={{ kind, key: data.nextKey }}
                  aria-label="Next speedrun"
                >
                  <ChevronRightIcon />
                </Link>
              </IconButton>
            )}
          </Flex>
          {data && (
            <Flex gap="6" wrap="wrap">
              {data.live && <Stat label="Ends in" value={<Countdown until={data.endsAt} />} />}
              {!data.live && data.standings[0] && (
                <Stat label="Winner" value={data.standings[0].username} />
              )}
              <Stat label="Players" value={data.playerCount.toLocaleString()} />
            </Flex>
          )}
        </Flex>
      </Card>

      <Flex gap="5" wrap="wrap" align="start">
        <Card
          size="1"
          className="tinted-card"
          style={{ flex: "999 1 560px", minWidth: 0, padding: 0, overflow: "hidden" }}
        >
          {!data?.live && data && (
            <Box px="4" pt="3">
              <Text size="2" color="gray">
                Final standings. Only the top 10 are kept once a speedrun ends.
              </Text>
            </Box>
          )}
          <StandingsHeader />
          {page.isLoading ? (
            <RowSkeletons count={8} />
          ) : page.isError ? (
            <EmptyState text="Couldn't load this speedrun. Try again in a moment." />
          ) : data?.standings.length ? (
            data.standings.map((s) => (
              <StandingRow
                key={s.userId}
                standing={s}
                kind={kind}
                speedrunKey={speedrunKey}
                open={expanded === s.userId}
                onToggle={() => setExpanded(expanded === s.userId ? null : s.userId)}
              />
            ))
          ) : (
            <EmptyState
              text={
                data?.live
                  ? "No plays yet. Set a score and it shows up here within a few seconds."
                  : "Nobody played in this speedrun."
              }
            />
          )}
          {data?.live && data.playerCount > PAGE_SIZE && (
            <Flex align="center" justify="between" px="4" py="3" gap="3">
              <Text size="2" color="gray">
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, data.playerCount)} of{" "}
                {data.playerCount.toLocaleString()}
              </Text>
              <Flex gap="2">
                <Button
                  variant="soft"
                  color="gray"
                  radius="full"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
                >
                  Previous
                </Button>
                <Button
                  variant="soft"
                  color="gray"
                  radius="full"
                  disabled={offset + PAGE_SIZE >= data.playerCount}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                </Button>
              </Flex>
            </Flex>
          )}
        </Card>

        <Flex direction="column" gap="4" style={{ flex: "1 1 300px", minWidth: 0 }}>
          {data?.me && (
            <Card size="3" className="tinted-card">
              <Flex direction="column" gap="2">
                <Heading as="h2" size="4">
                  Your standing
                </Heading>
                <Flex align="baseline" gap="2">
                  <Text size="8" weight="bold" className="tabular">
                    #{data.me.rank.toLocaleString()}
                  </Text>
                  <Text size="3" color="gray">
                    of {data.playerCount.toLocaleString()}
                  </Text>
                </Flex>
                <Text size="3">
                  <Text weight="bold" className="tabular">
                    {formatPp(data.me.totalPp)}
                  </Text>{" "}
                  <Text color="gray">pp from {data.me.playCount} plays</Text>
                </Text>
                {data.me.gapToNext !== null && (
                  <Text size="2" color="gray">
                    {formatPp(data.me.gapToNext)}pp behind #{data.me.rank - 1}
                  </Text>
                )}
              </Flex>
            </Card>
          )}
          <Card size="3" variant="surface">
            <Flex direction="column" gap="2">
              <Heading as="h2" size="3">
                How it counts
              </Heading>
              <Text size="2" color="gray">
                Your best play on each map that ended during this speedrun. Sorted by pp, each play
                is worth 95% of the one before it, like your profile&apos;s total.
              </Text>
              <Text size="2" color="gray">
                Lazer scores with a replay only. Speedruns run on UTC, and weeks start on Monday.
                When one ends, its top 10 are kept for good.
              </Text>
            </Flex>
          </Card>
        </Flex>
      </Flex>
    </Flex>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Flex direction="column">
      <Text size="1" color="gray">
        {label}
      </Text>
      <Text size="6" weight="bold" className="tabular">
        {value}
      </Text>
    </Flex>
  );
}

const STANDING_COLUMNS = "48px minmax(0, 1fr) 64px 104px";
const PODIUM_COLORS = ["#ffd75e", "#d6dbe4", "#ffb38a"];

function StandingsHeader() {
  return (
    <Box
      px="4"
      py="2"
      style={{
        display: "grid",
        gridTemplateColumns: STANDING_COLUMNS,
        gap: "var(--space-3)",
        borderBottom: "1px solid var(--accent-a4)",
      }}
    >
      <Text size="1" color="gray">
        #
      </Text>
      <Text size="1" color="gray">
        Player
      </Text>
      <Text size="1" color="gray" align="right">
        Plays
      </Text>
      <Text size="1" color="gray" align="right">
        Total pp
      </Text>
    </Box>
  );
}

function StandingRow({
  standing,
  kind,
  speedrunKey,
  open,
  onToggle,
}: {
  standing: SpeedrunStanding;
  kind: SpeedrunKind;
  speedrunKey: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Box className="score-row" style={{ backgroundColor: open ? "var(--accent-a3)" : undefined }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          all: "unset",
          boxSizing: "border-box",
          width: "100%",
          cursor: "pointer",
          display: "grid",
          gridTemplateColumns: STANDING_COLUMNS,
          gap: "var(--space-3)",
          alignItems: "center",
          padding: "var(--space-2) var(--space-4)",
        }}
      >
        <Text
          size="4"
          weight="bold"
          className="tabular"
          style={{ color: PODIUM_COLORS[standing.rank - 1] ?? "var(--gray-11)" }}
        >
          {standing.rank}
        </Text>
        <Flex align="center" gap="3" minWidth="0">
          <Avatar
            src={standing.avatarUrl}
            fallback={standing.username[0]?.toUpperCase() ?? "?"}
            size="2"
            radius="full"
          />
          <Text size="3" weight="medium" truncate>
            {standing.username}
          </Text>
        </Flex>
        <Text size="2" color="gray" align="right" className="tabular">
          {standing.playCount}
        </Text>
        <Text size="3" weight="bold" align="right" className="tabular">
          {formatPp(standing.totalPp)}
        </Text>
      </button>
      {open && <PlayerPlays kind={kind} speedrunKey={speedrunKey} userId={standing.userId} />}
    </Box>
  );
}

function PlayerPlays({
  kind,
  speedrunKey,
  userId,
}: {
  kind: SpeedrunKind;
  speedrunKey: string;
  userId: number;
}) {
  const plays = useQuery<SpeedrunPlayRow[]>({
    queryKey: ["speedrun", kind, speedrunKey, "players", userId],
    queryFn: async () => {
      const res = await fetch(`/api/speedruns/${kind}/${speedrunKey}/players/${userId}`);
      if (!res.ok) throw new Error("Failed to load plays");
      return res.json();
    },
  });

  if (plays.isLoading) return <RowSkeletons count={3} />;
  if (!plays.data) return <EmptyState text="Couldn't load this player's plays." />;

  return (
    <Flex direction="column" pb="2" style={{ paddingLeft: "calc(48px + var(--space-3))" }}>
      <Flex justify="between" px="4" py="1">
        <Text size="1" color="gray">
          Counting plays, best per map
        </Text>
        <Text size="1" color="gray">
          pp · weight · weighted
        </Text>
      </Flex>
      {plays.data.map((p, i) => {
        const weight = 0.95 ** i;
        return (
          <Link
            key={p.scoreId}
            to="/score/$scoreId"
            params={{ scoreId: p.scoreId }}
            state={{ autoplay: true }}
            className="score-row"
            style={{ color: "inherit" }}
          >
            <Flex align="center" gap="3" px="4" py="2">
              <GradeBadge rank={p.rank} size={32} />
              <Box
                width="64px"
                height="40px"
                flexShrink="0"
                display={{ initial: "none", sm: "block" }}
                style={{
                  borderRadius: "var(--radius-3)",
                  backgroundColor: "var(--gray-a3)",
                  backgroundImage: `url(https://assets.ppy.sh/beatmaps/${p.beatmapSetId}/covers/list@2x.jpg)`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
              <Flex direction="column" flexGrow="1" minWidth="0" gap="1">
                <Flex align="baseline" gap="2" minWidth="0">
                  <Text size="2" weight="medium" truncate>
                    {p.title}
                  </Text>
                  <Text size="1" color="gray" truncate style={{ flexShrink: 2 }}>
                    [{p.version}]
                  </Text>
                  <Text
                    size="1"
                    className="tabular"
                    style={{ color: "#ffd75e", whiteSpace: "nowrap" }}
                  >
                    ★ {p.starRating.toFixed(2)}
                  </Text>
                </Flex>
                <Flex align="center" gap="2">
                  <ModChips mods={p.mods.filter((mod) => mod !== "CL")} />
                  <Text size="1" color="gray" className="tabular">
                    {(p.accuracy * 100).toFixed(2)}%
                  </Text>
                </Flex>
              </Flex>
              <Text size="2" weight="bold" className="tabular" style={{ whiteSpace: "nowrap" }}>
                {Math.round(p.pp)}pp
              </Text>
              <Box display={{ initial: "none", sm: "block" }}>
                <Text size="1" color="gray" className="tabular" style={{ whiteSpace: "nowrap" }}>
                  ×{weight.toFixed(2)}
                </Text>
              </Box>
              <Text
                size="2"
                color="pink"
                className="tabular"
                align="right"
                style={{ width: 56, flexShrink: 0 }}
              >
                {Math.round(p.pp * weight)}
              </Text>
            </Flex>
          </Link>
        );
      })}
    </Flex>
  );
}

function RowSkeletons({ count }: { count: number }) {
  return (
    <Flex direction="column">
      {Array.from({ length: count }, (_, i) => (
        <Flex key={i} align="center" gap="3" px="4" py="2">
          <Skeleton width="32px" height="32px" />
          <Skeleton height="16px" width="40%" />
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
