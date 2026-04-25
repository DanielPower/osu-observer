import { createFileRoute } from "@tanstack/react-router";
import { Box, Heading, Text } from "@radix-ui/themes";

export const Route = createFileRoute("/about")({
  component: About,
});

function About() {
  return (
    <Box p="4">
      <Heading size="6" mb="2">
        About
      </Heading>
      <Text color="gray">Hello from About!</Text>
    </Box>
  );
}
