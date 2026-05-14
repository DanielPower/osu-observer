import indexCss from "../index.css?url";
import { createRootRoute, HeadContent, Outlet, Link, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Avatar,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Link as RadixLink,
  IconButton,
  Text,
  Theme,
} from "@radix-ui/themes";
import { ExitIcon } from "@radix-ui/react-icons";
import { useAuth, useLogout } from "../hooks/useAuth";
import { useDynamicAccent } from "../hooks/useDynamicAccent";
import { DynamicAccentContext } from "../lib/dynamicAccentContext";

const queryClient = new QueryClient();

const RootLayout = () => {
  const { data: user } = useAuth();
  const logout = useLogout();
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  useDynamicAccent(bgUrl ?? undefined);

  return (
    <DynamicAccentContext.Provider value={setBgUrl}>
      <Box
        minHeight="100vh"
        style={{
          display: "flex",
          flexDirection: "column",
          background: `
            radial-gradient(1200px 600px at 10% -10%, color-mix(in oklab, var(--accent-9) 18%, transparent), transparent 60%),
            radial-gradient(1000px 500px at 110% 10%, color-mix(in oklab, var(--accent-10) 14%, transparent), transparent 60%),
            var(--color-background)
          `,
        }}
      >
        <Box
          asChild
          style={{
            borderBottom: "1px solid var(--accent-a5)",
            backgroundColor: "color-mix(in oklab, var(--accent-2) 60%, transparent)",
            backdropFilter: "blur(12px)",
            position: "sticky",
            top: 0,
            zIndex: 50,
          }}
        >
          <header>
            <Container size="4" px="6" py="4">
              <Flex align="center" justify="between" gap="4" wrap="wrap">
                <Heading size="6">
                  <Link to="/" style={{ textDecoration: "none" }}>
                    <span>osu!</span>
                    <span
                      style={{
                        background: "linear-gradient(90deg, var(--accent-11), var(--accent-9))",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      observer
                    </span>
                  </Link>
                </Heading>
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

        <Container size="4" px="4" flexGrow="1">
          <Flex flexGrow="1">
            <Outlet />
          </Flex>
        </Container>

        <Box
          asChild
          mt="8"
          style={{
            borderTop: "1px solid var(--accent-a5)",
            backgroundColor: "color-mix(in oklab, var(--accent-2) 40%, transparent)",
          }}
        >
          <footer>
            <Container size="4" px="6" py="4">
              <Flex align="center" justify="between" wrap="wrap" gap="4">
                <Text size="1" color="gray">
                  <RadixLink asChild size="1" color="gray">
                    <a href="https://danielpower.ca">Built by Daniel Power</a>
                  </RadixLink>
                </Text>
                <Flex gap="4">
                  <RadixLink asChild size="1" color="gray">
                    <a href="/changelog">Changelog</a>
                  </RadixLink>
                  <RadixLink asChild size="1" color="gray">
                    <a href="/discussion">Discussion</a>
                  </RadixLink>
                  <RadixLink asChild size="1" color="gray">
                    <a href="https://discord.gg/fyh7kPTYUb">Discord</a>
                  </RadixLink>
                  <RadixLink asChild size="1" color="gray">
                    <a href="https://github.com/danielpower/osu-observer">GitHub</a>
                  </RadixLink>
                </Flex>
              </Flex>
            </Container>
          </footer>
        </Box>

        <TanStackRouterDevtools />
      </Box>
    </DynamicAccentContext.Provider>
  );
};

const RootDocument = ({ children }: { children: React.ReactNode }) => (
  <html lang="en">
    <head>
      <meta charSet="UTF-8" />
      <link rel="icon" type="image/svg+xml" href="/vite.svg" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>observer</title>
      <HeadContent />
    </head>
    <body>
      <Theme appearance="dark" accentColor="violet" grayColor="mauve" radius="large" scaling="100%">
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </Theme>
      <Scripts />
    </body>
  </html>
);

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: "stylesheet", href: indexCss }],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
});
