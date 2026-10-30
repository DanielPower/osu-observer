import { useSearch, useNavigate } from "@tanstack/react-router";
import { Button, Flex, Heading, IconButton, SegmentedControl, Text } from "@radix-ui/themes";
import { Cross2Icon } from "@radix-ui/react-icons";
import { Slider } from "./ui/Slider";
import { Select } from "./ui/Select";
import { Toggle } from "./ui/Toggle";
import type { PlayerSettings } from "../hooks/usePlayerSettings";

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.5, 2];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      as="div"
      size="1"
      weight="bold"
      color="gray"
      style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}
    >
      {children}
    </Text>
  );
}

export function OptionsPopup({
  open,
  onClose,
  settings,
  onChange,
  onReset,
  skins,
  portalContainer,
}: {
  open: boolean;
  onClose: () => void;
  settings: PlayerSettings;
  onChange: (patch: Partial<PlayerSettings>) => void;
  onReset: () => void;
  skins: { id: string; name: string }[];
  portalContainer: HTMLElement | null;
}) {
  const { skin } = useSearch({ from: "/score/$scoreId" });
  const navigate = useNavigate({ from: "/score/$scoreId" });

  return (
    <>
      <div className="settings-backdrop" data-open={open} onClick={onClose} aria-hidden="true" />

      <div
        className="settings-panel"
        data-open={open}
        role="dialog"
        aria-label="Replay settings"
        aria-hidden={!open}
        inert={!open}
      >
        <Flex align="center" justify="between" mb="4">
          <Heading size="4">Settings</Heading>
          <IconButton variant="ghost" color="gray" onClick={onClose} aria-label="Close settings">
            <Cross2Icon />
          </IconButton>
        </Flex>

        <Flex direction="column" gap="5" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <Flex direction="column" gap="4">
            <SectionLabel>Audio</SectionLabel>
            <Slider
              id="volume-slider"
              label="Music"
              value={settings.musicVolume}
              displayValue={`${Math.round(settings.musicVolume * 100)}%`}
              onInput={(musicVolume) => onChange({ musicVolume })}
            />
            <Slider
              id="effects-slider"
              label="Hitsounds"
              value={settings.effectsVolume}
              displayValue={`${Math.round(settings.effectsVolume * 100)}%`}
              onInput={(effectsVolume) => onChange({ effectsVolume })}
            />
          </Flex>

          <Flex direction="column" gap="4">
            <SectionLabel>Visuals</SectionLabel>
            <Slider
              id="dim-slider"
              label="Background dim"
              value={settings.backgroundDim}
              displayValue={`${Math.round(settings.backgroundDim * 100)}%`}
              onInput={(backgroundDim) => onChange({ backgroundDim })}
            />
            <Select
              id="skin-select"
              label="Skin"
              value={skin}
              container={portalContainer}
              onChange={(value) =>
                navigate({
                  to: ".",
                  search: (prev) => ({
                    ...prev,
                    skin: value,
                  }),
                  replace: true,
                })
              }
              options={skins.map(({ id, name }) => ({ value: id, label: name }))}
            />
            <Toggle
              id="beatmap-combo-colors"
              label="Beatmap combo colours"
              description="Use the map's colours instead of the skin's."
              checked={settings.useBeatmapComboColors}
              onChange={(useBeatmapComboColors) => onChange({ useBeatmapComboColors })}
            />
            <Toggle
              id="cursor-analysis"
              label="Cursor analysis"
              description="Draw the recent cursor path and mark each click."
              checked={settings.cursorAnalysis}
              onChange={(cursorAnalysis) => onChange({ cursorAnalysis })}
            />
          </Flex>

          <Flex direction="column" gap="3">
            <SectionLabel>Playback speed</SectionLabel>
            <SegmentedControl.Root
              size="1"
              style={{ width: "100%" }}
              value={String(settings.playbackSpeed)}
              onValueChange={(value) => onChange({ playbackSpeed: Number(value) })}
            >
              {SPEED_OPTIONS.map((speed) => (
                <SegmentedControl.Item key={speed} value={String(speed)}>
                  {speed}×
                </SegmentedControl.Item>
              ))}
            </SegmentedControl.Root>
          </Flex>
        </Flex>

        <Flex
          align="center"
          justify="between"
          pt="3"
          mt="4"
          style={{ borderTop: "1px solid var(--accent-a5)" }}
        >
          <Text size="1" color="gray">
            Saved in this browser
          </Text>
          <Button size="1" variant="ghost" color="gray" onClick={onReset}>
            Reset to defaults
          </Button>
        </Flex>
      </div>
    </>
  );
}
