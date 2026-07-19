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
  onVolumeChange,
  effectsVolume,
  onEffectsVolumeChange,
  backgroundDim,
  onBackgroundDimChange,
  useBeatmapComboColors,
  onUseBeatmapComboColorsChange,
  playbackSpeed,
  onPlaybackSpeedChange,
  cursorAnalysis,
  onCursorAnalysisChange,
  skins,
}: {
  open: boolean;
  onClose: () => void;
  audio: HTMLAudioElement | null;
  onVolumeChange: (v: number) => void;
  effectsVolume: number;
  onEffectsVolumeChange: (v: number) => void;
  backgroundDim: number;
  onBackgroundDimChange: (dim: number) => void;
  useBeatmapComboColors: boolean;
  onUseBeatmapComboColorsChange: (value: boolean) => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  cursorAnalysis: boolean;
  onCursorAnalysisChange: (enabled: boolean) => void;
  skins: { id: string; name: string }[];
}) {
  const { skin } = useSearch({ from: "/score/$scoreId" });
  const navigate = useNavigate({ from: "/score/$scoreId" });
  const [volume, setVolume] = useState(1);
  useEffect(() => {
    if (!audio) {
      setVolume(1);
      return;
    }
    const syncVolume = () => setVolume(audio.volume);
    audio.addEventListener("volumechange", syncVolume);
    return () => audio.removeEventListener("volumechange", syncVolume);
  }, [audio]);

  return (
    <>
      {/* Click-outside area */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 40,
          pointerEvents: open ? "auto" : "none",
        }}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "20rem",
          padding: "var(--space-6)",
          transition: "transform 300ms",
          transform: open ? "translateX(0)" : "translateX(100%)",
          backgroundImage:
            "linear-gradient(180deg, color-mix(in oklab, var(--accent-2) 92%, transparent), color-mix(in oklab, var(--accent-3) 92%, transparent))",
          backdropFilter: "blur(12px)",
          borderLeft: "1px solid var(--accent-a6)",
        }}
      >
        <Flex align="center" justify="between" mb="5">
          <Heading
            size="4"
            style={{
              background: "linear-gradient(90deg, var(--accent-11), var(--accent-9))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Options
          </Heading>
          <IconButton variant="ghost" color="gray" onClick={onClose} aria-label="Close options">
            <Cross2Icon />
          </IconButton>
        </Flex>

        <Flex direction="column" gap="5">
          <Slider
            id="volume-slider"
            label="Music"
            value={volume}
            displayValue={`${Math.round(volume * 100)}%`}
            onInput={onVolumeChange}
          />
          <Slider
            id="effects-slider"
            label="Effects"
            value={effectsVolume}
            displayValue={`${Math.round(effectsVolume * 100)}%`}
            onInput={onEffectsVolumeChange}
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
            options={skins.map(({ id, name }) => ({ value: id, label: name }))}
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
