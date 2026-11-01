import { Flex } from "@radix-ui/themes";
import { GRADES, MOD_COLORS } from "../lib/grade-colors";

export function gradeLabel(rank: string) {
  return GRADES[rank]?.label ?? rank;
}

export function GradeBadge({ rank, size = 40 }: { rank: string; size?: number }) {
  const grade = GRADES[rank] ?? { label: rank, color: "var(--gray-12)", bg: "var(--gray-a4)" };
  return (
    <Flex
      align="center"
      justify="center"
      flexShrink="0"
      aria-label={`Grade ${grade.label}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: grade.bg,
        color: grade.color,
        fontWeight: 800,
        fontSize: size * 0.45,
        lineHeight: 1,
      }}
    >
      {grade.label}
    </Flex>
  );
}

export function ModChips({ mods }: { mods: string[] }) {
  if (mods.length === 0) return null;
  return (
    <Flex gap="1" wrap="wrap">
      {mods.map((mod) => (
        <span
          key={mod}
          style={{
            padding: "2px 7px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            backgroundColor: MOD_COLORS[mod] ?? "var(--gray-11)",
            color: "#120e17",
          }}
        >
          {mod}
        </span>
      ))}
    </Flex>
  );
}
