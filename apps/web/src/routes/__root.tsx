import { createRootRoute, Outlet } from "@tanstack/react-router";
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
  Text,
} from "@radix-ui/themes";
import { ExitIcon } from "@radix-ui/react-icons";
import { useAuth, useLogout } from "../hooks/useAuth";
import { useDynamicAccent } from "../hooks/useDynamicAccent";
import { DynamicAccentContext } from "../lib/dynamicAccentContext";
import { Link } from "@tanstack/react-router";

const RootLayout = () => {
  const { data: user } = useAuth();
  const logout = useLogout();
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const accentStyles = useDynamicAccent(bgUrl ?? undefined);

  return (
    <DynamicAccentContext.Provider value={setBgUrl}>
      <Box
        minHeight="100vh"
        style={{
          ...accentStyles,
          background: `
            radial-gradient(1200px 600px at 10% -10%, color-mix(in oklab, var(--accent-9) 18%, transparent), transparent 60%),
            radial-gradient(1000px 500px at 110% 10%, color-mix(in oklab, var(--accent-10) 14%, transparent), transparent 60%),
            var(--color-background)
          `,
          transition: "background 600ms ease",
        }}
      >
        <Box
          asChild
          style={{
            borderBottom: "1px solid var(--accent-a5)",
            backgroundColor:
              "color-mix(in oklab, var(--accent-2) 60%, transparent)",
            backdropFilter: "blur(12px)",
            position: "sticky",
            top: 0,
            zIndex: 50,
            transition: "background-color 600ms ease, border-color 600ms ease",
          }}
        >
          <header>
            <Container size="4" px="6" py="4">
              <Flex align="center" justify="between" gap="4" wrap="wrap">
                <Link to="/" style={{ textDecoration: "none" }}>
                  <Heading size="6">
                    <span>osu!</span>
                    <span
                      style={{
                        background:
                          "linear-gradient(90deg, var(--accent-11), var(--accent-9))",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      observer
                    </span>
                  </Heading>
                </Link>
                <Flex align="center" gap="4">
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
                    <Button asChild variant="solid">
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
    </DynamicAccentContext.Provider>
  );
};

export const Route = createRootRoute({
  component: RootLayout,
});
