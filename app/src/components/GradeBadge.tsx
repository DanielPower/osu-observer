import { Flex } from "@radix-ui/themes";

const GRADES: Record<string, { label: string; color: string; bg: string }> = {
  XH: { label: "SS", color: "#e8edf5", bg: "#2c3240" },
  X: { label: "SS", color: "#ffd75e", bg: "#3a3220" },
  SH: { label: "S", color: "#cfd6e2", bg: "#2a303b" },
  S: { label: "S", color: "#ffb347", bg: "#3a2c1c" },
  A: { label: "A", color: "#7fe08a", bg: "#1d3322" },
  B: { label: "B", color: "#6cb6ff", bg: "#1c2a3d" },
  C: { label: "C", color: "#c79bff", bg: "#2c2240" },
  D: { label: "D", color: "#ff7b7b", bg: "#3d1f22" },
  F: { label: "F", color: "#ff7b7b", bg: "#3d1f22" },
};

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

const MOD_COLORS: Record<string, string> = {
  HD: "#ffd75e",
  HR: "#ff8a8a",
  DT: "#c79bff",
  NC: "#c79bff",
  HT: "#9ec7ff",
  EZ: "#9effc0",
  FL: "#e4dcee",
  NF: "#9ec7ff",
  SD: "#ffb38a",
  PF: "#ffb38a",
};

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
