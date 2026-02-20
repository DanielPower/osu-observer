import { useState, useEffect } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";

export function OptionsPopup({
  popoverId,
  audio,
  backgroundDim,
  onBackgroundDimChange,
}: {
  popoverId: string;
  audio: HTMLAudioElement | null;
  backgroundDim: number;
  onBackgroundDimChange: (dim: number) => void;
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
      <style>{`
        [popover] {
          border: none;
          margin: 0;
          position: fixed;
          inset: unset;
          position-anchor: --options-button;
          bottom: anchor(top);
          right: anchor(right);
        }
        [popover]::backdrop {
          background: transparent;
        }
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: none;
        }
        input[type='range']::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: none;
        }
        input[type='range']::-webkit-slider-runnable-track {
          height: 8px;
          border-radius: 4px;
        }
        input[type='range']::-moz-range-track {
          height: 8px;
          border-radius: 4px;
        }
      `}</style>
      <div
        id={popoverId}
        popover="auto"
        className="rounded-lg bg-slate-800 p-4 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-semibold text-white">Options</h2>
        <div className="w-64 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="volume-slider" className="text-sm text-gray-300">
                Volume
              </label>
              <span className="text-sm text-gray-400">
                {Math.round(volume * 100)}%
              </span>
            </div>
            <input
              id="volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onInput={(e) => {
                const newVolume = parseFloat(e.currentTarget.value);
                if (audio) audio.volume = newVolume;
              }}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-600 accent-blue-500"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="dim-slider" className="text-sm text-gray-300">
                Background Dim
              </label>
              <span className="text-sm text-gray-400">
                {Math.round(backgroundDim * 100)}%
              </span>
            </div>
            <input
              id="dim-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={backgroundDim}
              onInput={(e) =>
                onBackgroundDimChange(parseFloat(e.currentTarget.value))
              }
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-600 accent-blue-500"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="skin-select" className="text-sm text-gray-300">
              Skin
            </label>
            <select
              id="skin-select"
              value={skin}
              onChange={(e) =>
                navigate({
                  search: (prev) => ({
                    ...prev,
                    skin: e.target.value,
                  }),
                })
              }
              className="w-full cursor-pointer rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="default">Default</option>
              <option value="Cookiezi04">Cookiezi</option>
            </select>
          </div>
        </div>
      </div>
    </>
  );
}
