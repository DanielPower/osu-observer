import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  IconButton,
  TextField,
  Text,
} from "@radix-ui/themes";
import { MagnifyingGlassIcon, ExitIcon } from "@radix-ui/react-icons";
import { useAuth, useLogout } from "../hooks/useAuth";

const RootLayout = () => {
  const navigate = useNavigate();
  const [scoreIdInput, setScoreIdInput] = useState("");
  const { data: user } = useAuth();
  const logout = useLogout();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = scoreIdInput.trim();
    if (trimmed) {
      navigate({ to: "/score/$scoreId", params: { scoreId: trimmed } });
      setScoreIdInput("");
    }
  };

  return (
    <Box minHeight="100vh">
      <Box
        asChild
        style={{
          borderBottom: "1px solid var(--violet-a5)",
          backgroundColor: "color-mix(in oklab, var(--violet-2) 60%, transparent)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <header>
          <Container size="4" px="6" py="4">
            <Flex align="center" justify="between" gap="4" wrap="wrap">
              <a href="/" style={{ textDecoration: "none" }}>
                <Heading
                  size="6"
                  style={{
                    background:
                      "linear-gradient(90deg, var(--violet-11), var(--purple-11))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  osu! observer
                </Heading>
              </a>
              <Flex align="center" gap="4">
                <form onSubmit={handleSubmit}>
                  <Flex gap="2">
                    <TextField.Root
                      size="2"
                      value={scoreIdInput}
                      onChange={(e) => setScoreIdInput(e.target.value)}
                      placeholder="Score ID"
                    >
                      <TextField.Slot>
                        <MagnifyingGlassIcon />
                      </TextField.Slot>
                    </TextField.Root>
                    <Button type="submit" variant="solid" color="violet">
                      Go
                    </Button>
                  </Flex>
                </form>
                {user ? (
                  <Flex align="center" gap="3">
                    <Avatar
                      src={user.avatar_url}
                      alt={user.username}
                      fallback={user.username[0]?.toUpperCase() ?? "?"}
                      size="2"
                      radius="full"
                    />
                    <Text size="2" color="gray">
                      {user.username}
                    </Text>
                    <IconButton
                      variant="ghost"
                      color="gray"
                      onClick={() => logout.mutate()}
                      aria-label="Logout"
                    >
                      <ExitIcon />
                    </IconButton>
                  </Flex>
                ) : (
                  <Button asChild variant="solid" color="purple">
                    <a href="/api/auth/login">Login with osu!</a>
                  </Button>
                )}
              </Flex>
            </Flex>
          </Container>
        </header>
      </Box>

      <Container size="4" px="4">
        <Flex flexGrow="1">
          <Outlet />
        </Flex>
      </Container>
      <TanStackRouterDevtools />
    </Box>
  );
};

export const Route = createRootRoute({
  component: RootLayout,
});
