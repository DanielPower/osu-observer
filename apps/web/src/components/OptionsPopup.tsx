import { useState, useEffect } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
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
        className={`absolute top-0 right-0 z-50 flex h-full w-72 flex-col bg-slate-950/50 p-6 shadow-2xl backdrop-blur-xs transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Options</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close options"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
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
                search: (prev) => ({
                  ...prev,
                  skin: value,
                }),
              })
            }
            options={[
              { value: "default", label: "Default" },
              { value: "Cookiezi04", label: "Cookiezi" },
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
        </div>
      </div>
    </>
  );
}
