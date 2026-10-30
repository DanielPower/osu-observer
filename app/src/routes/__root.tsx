import indexCss from "../index.css?url";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Link,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Avatar,
  Box,
  Button,
  Container,
  Flex,
  Link as RadixLink,
  IconButton,
  Text,
  Theme,
} from "@radix-ui/themes";
import { ExitIcon } from "@radix-ui/react-icons";
import { useAuth, useLogout } from "../hooks/useAuth";
import { useDynamicAccent } from "../hooks/useDynamicAccent";
import { DEFAULT_ACCENT_COLOR } from "../lib/accentVars";
import { Logo } from "../components/Logo";

const queryClient = new QueryClient();

const RootLayout = () => {
  const { data: user } = useAuth();
  const logout = useLogout();
  const bgColor = useRouterState({
    select: (state) => {
      for (const match of state.matches) {
        const color = (match.loaderData as { beatmap?: { bgColor?: string | null } } | undefined)
          ?.beatmap?.bgColor;
        if (color) return color;
      }
      return DEFAULT_ACCENT_COLOR;
    },
  });
  useDynamicAccent(bgColor);

  return (
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
          <Container size="4" px="4" py="3">
            <Flex align="center" justify="between" gap="4" wrap="wrap">
              <Link to="/" aria-label="osu!observer home">
                <Logo />
              </Link>
              <Flex align="center" gap="4">
                <RadixLink
                  asChild
                  size="2"
                  color="gray"
                  highContrast
                  weight="medium"
                  underline="hover"
                >
                  <Link to="/speedruns">Speedruns</Link>
                </RadixLink>
                <Box display={{ initial: "none", sm: "block" }}>
                  <RadixLink
                    asChild
                    size="2"
                    color="gray"
                    highContrast
                    weight="medium"
                    underline="hover"
                  >
                    <Link to="/changelog">Changelog</Link>
                  </RadixLink>
                </Box>
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
                      aria-label="Log out"
                    >
                      <ExitIcon />
                    </IconButton>
                  </Flex>
                ) : (
                  <Button asChild variant="solid" radius="full">
                    <a href="/api/auth/login">Log in with osu!</a>
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
          <Container size="4" px="4" py="4">
            <Flex align="center" justify="between" wrap="wrap" gap="4">
              <Text size="1" color="gray">
                Built by{" "}
                <RadixLink asChild size="1" color="gray" underline="always">
                  <a href="https://osu.ppy.sh/users/10624401">CrispyUmbrella</a>
                </RadixLink>
                . Not affiliated with ppy.
              </Text>
              <Flex gap="4">
                <RadixLink asChild size="1" color="gray">
                  <Link to="/changelog">Changelog</Link>
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
  );
};

const RootDocument = ({ children }: { children: React.ReactNode }) => (
  <html lang="en">
    <head>
      <meta charSet="UTF-8" />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap"
      />
      <HeadContent />
    </head>
    <body>
      <Theme appearance="dark" accentColor="pink" grayColor="mauve" radius="large" scaling="100%">
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </Theme>
      <Scripts />
    </body>
  </html>
);

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "osu!observer" }],
    links: [{ rel: "stylesheet", href: indexCss }],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
});
