import { Flex, Text } from "@radix-ui/themes";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13.5" fill="none" stroke="var(--accent-9)" strokeWidth="3.5" />
      <circle cx="16" cy="16" r="7" fill="var(--accent-9)" />
      <circle cx="16" cy="16" r="2.75" fill="var(--color-background)" />
    </svg>
  );
}

export function Logo() {
  return (
    <Flex align="center" gap="2">
      <LogoMark />
      <Text size="5" weight="bold" style={{ letterSpacing: "-0.01em", color: "var(--gray-12)" }}>
        osu!<span style={{ color: "var(--accent-11)" }}>observer</span>
      </Text>
    </Flex>
  );
}
