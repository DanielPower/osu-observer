import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Text,
  TextField,
} from "@radix-ui/themes";
import { RocketIcon } from "@radix-ui/react-icons";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [scoreId, setScoreId] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = scoreId.trim();
    if (trimmed) {
      navigate({ to: "/score/$scoreId", params: { scoreId: trimmed } });
    }
  };

  return (
    <Flex
      width="100%"
      flexGrow="1"
      direction="column"
      align="center"
      justify="center"
      py="9"
      px="4"
      gap="6"
    >
      <Flex direction="column" align="center" gap="3" mb="2">
        <Heading
          size="9"
          align="center"
          style={{
            background:
              "linear-gradient(135deg, var(--violet-11), var(--purple-10))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Observe your replays
        </Heading>
        <Text size="4" color="gray" align="center" style={{ maxWidth: 560 }}>
          Quickly view and analyze osu! replays. Enter a Score ID below to get
          started.
        </Text>
      </Flex>

      <Card
        size="3"
        style={{
          width: "100%",
          maxWidth: 480,
          backgroundImage:
            "linear-gradient(180deg, var(--violet-a3), var(--purple-a2))",
          borderColor: "var(--violet-a6)",
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
            <Button
              type="submit"
              size="3"
              color="violet"
              variant="solid"
              disabled={!scoreId.trim()}
            >
              <RocketIcon />
              View Replay
            </Button>
          </Flex>
        </form>
      </Card>
    </Flex>
  );
}
