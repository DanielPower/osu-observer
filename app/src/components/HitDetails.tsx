import { Flex, Text } from "@radix-ui/themes";
import { HitResult } from "osu-classes";
import { JUDGEMENT_COLORS, type JudgementMarker } from "osu-renderer";

const RESULT_LABELS: Partial<Record<HitResult, string>> = {
  [HitResult.Perfect]: "300",
  [HitResult.Great]: "300",
  [HitResult.Good]: "100",
  [HitResult.Ok]: "100",
  [HitResult.Meh]: "50",
  [HitResult.Miss]: "Miss",
  [HitResult.IgnoreMiss]: "Slider end miss",
};

const HIT_TYPE_SPINNER = 1 << 3;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Flex justify="between" gap="4">
      <Text size="1" style={{ color: "rgba(255, 255, 255, 0.65)" }}>
        {label}
      </Text>
      <Text size="1" style={{ color: "white", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Text>
    </Flex>
  );
}

function timingText(timing: number): string {
  const ms = Math.round(timing);
  if (ms === 0) return "on time";
  return `${Math.abs(ms)} ms ${ms < 0 ? "early" : "late"}`;
}

/** Details of a cursor analysis judgement marker, shown above it while paused. */
export function HitDetails({
  marker,
  left,
  top,
}: {
  marker: JudgementMarker;
  /** The marker's position in CSS pixels, relative to the player. */
  left: number;
  top: number;
}) {
  const { hitObject, result, radius } = marker;
  // A slider end's marker shares the slider's hit object, but the click stats are the head's.
  const click = result === HitResult.IgnoreMiss ? undefined : hitObject.click;
  const isSpinner = (hitObject.type & HIT_TYPE_SPINNER) !== 0;

  return (
    <Flex
      direction="column"
      gap="1"
      style={{
        position: "absolute",
        left,
        top,
        // Below the marker when there's no room above it.
        transform: top < 140 ? "translate(-50%, 18px)" : "translate(-50%, calc(-100% - 18px))",
        minWidth: 180,
        padding: "8px 12px",
        borderRadius: "var(--radius-3)",
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        border: "1px solid var(--accent-a6)",
        pointerEvents: "none",
        zIndex: 15,
      }}
    >
      <Text size="2" weight="bold" style={{ color: JUDGEMENT_COLORS[result] ?? "white" }}>
        {isSpinner ? `Spinner ${RESULT_LABELS[result] ?? ""}` : RESULT_LABELS[result]}
      </Text>
      {click ? (
        <>
          <Row label="Timing" value={timingText(click.timing)} />
          <Row
            label="Distance"
            value={`${click.distance.toFixed(1)} px (${Math.round((click.distance / radius) * 100)}% of radius)`}
          />
          {click.angle !== undefined && (
            <Row label="Angle" value={`${Math.abs(click.angle).toFixed(1)}° off line`} />
          )}
          {click.overshoot !== undefined && (
            <Row
              label={click.overshoot < 0 ? "Undershoot" : "Overshoot"}
              value={`${Math.abs(click.overshoot).toFixed(1)} px`}
            />
          )}
        </>
      ) : (
        !isSpinner &&
        result !== HitResult.IgnoreMiss && (
          <Text size="1" style={{ color: "rgba(255, 255, 255, 0.65)" }}>
            No click on this object
          </Text>
        )
      )}
    </Flex>
  );
}
