import { useState, useEffect } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { Flex, Heading, IconButton } from "@radix-ui/themes";
import { Cross2Icon } from "@radix-ui/react-icons";
import { Slider } from "./ui/Slider";
import { Select } from "./ui/Select";
import { Toggle } from "./ui/Toggle";

export function OptionsPopup({
  open,
  onClose,
  audio,
  backgroundDim,
  onBackgroundDimChange,
  useBeatmapComboColors,
  onUseBeatmapComboColorsChange,
  playbackSpeed,
  onPlaybackSpeedChange,
  cursorAnalysis,
  onCursorAnalysisChange,
}: {
  open: boolean;
  onClose: () => void;
  audio: HTMLAudioElement | null;
  backgroundDim: number;
  onBackgroundDimChange: (dim: number) => void;
  useBeatmapComboColors: boolean;
  onUseBeatmapComboColorsChange: (value: boolean) => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  cursorAnalysis: boolean;
  onCursorAnalysisChange: (enabled: boolean) => void;
}) {
  const { skin } = useSearch({ from: "/score/$scoreId" });
  const navigate = useNavigate({ from: "/score/$scoreId" });
  const [volume, setVolume] = useState(audio?.volume ?? 1);

  useEffect(() => {
    if (!audio) return;
    const handleVolumeChange = () => setVolume(audio.volume);
    setVolume(audio.volume);
    audio.addEventListener("volumechange", handleVolumeChange);
    return () => audio.removeEventListener("volumechange", handleVolumeChange);
  }, [audio]);

  return (
    <>
      {/* Click-outside area */}
      <div
        className={`absolute inset-0 z-40 ${open ? "" : "pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        className={`absolute top-0 right-0 z-50 flex h-full w-80 flex-col p-6 transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          backgroundImage:
            "linear-gradient(180deg, color-mix(in oklab, var(--accent-2) 92%, transparent), color-mix(in oklab, var(--accent-3) 92%, transparent))",
          backdropFilter: "blur(12px)",
          borderLeft: "1px solid var(--accent-a6)",
          boxShadow:
            "-12px 0 40px -12px color-mix(in oklab, var(--accent-9) 30%, transparent)",
        }}
      >
        <Flex align="center" justify="between" mb="5">
          <Heading
            size="4"
            style={{
              background:
                "linear-gradient(90deg, var(--accent-11), var(--accent-9))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Options
          </Heading>
          <IconButton
            variant="ghost"
            color="gray"
            onClick={onClose}
            aria-label="Close options"
          >
            <Cross2Icon />
          </IconButton>
        </Flex>

        <Flex direction="column" gap="5">
          <Slider
            id="volume-slider"
            label="Volume"
            value={volume}
            displayValue={`${Math.round(volume * 100)}%`}
            onInput={(v) => {
              if (audio) audio.volume = v;
            }}
          />
          <Slider
            id="dim-slider"
            label="Background Dim"
            value={backgroundDim}
            displayValue={`${Math.round(backgroundDim * 100)}%`}
            onInput={onBackgroundDimChange}
          />
          <Select
            id="skin-select"
            label="Skin"
            value={skin}
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
            options={[
              { value: "default", label: "Default" },
              { value: "Cookiezi04", label: "Cookiezi" },
              { value: "counter-strike", label: "Counter-Strike" },
            ]}
          />
          <Slider
            id="speed-slider"
            label="Playback Speed"
            value={playbackSpeed}
            min={0.25}
            max={4}
            step={0.25}
            displayValue={`${playbackSpeed}x`}
            onInput={onPlaybackSpeedChange}
          />
          <Toggle
            id="beatmap-combo-colors"
            label="Use beatmap combo colors"
            checked={useBeatmapComboColors}
            onChange={onUseBeatmapComboColorsChange}
          />
          <Toggle
            id="cursor-analysis"
            label="Cursor analysis"
            checked={cursorAnalysis}
            onChange={onCursorAnalysisChange}
          />
        </Flex>
      </div>
    </>
  );
}
