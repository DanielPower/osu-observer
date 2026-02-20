import { useState, useEffect } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";

export function OptionsPopup({
  open,
  onClose,
  audio,
  backgroundDim,
  onBackgroundDimChange,
}: {
  open: boolean;
  onClose: () => void;
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
        .options-sidebar input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: none;
        }
        .options-sidebar input[type='range']::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: none;
        }
        .options-sidebar input[type='range']::-webkit-slider-runnable-track {
          height: 8px;
          border-radius: 4px;
        }
        .options-sidebar input[type='range']::-moz-range-track {
          height: 8px;
          border-radius: 4px;
        }
      `}</style>

      {/* Click-outside area */}
      <div
        className={`absolute inset-0 z-40 ${open ? "" : "pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        className={`options-sidebar absolute top-0 right-0 z-50 flex h-full w-72 flex-col bg-slate-950/50 p-6 shadow-2xl backdrop-blur-xs transition-transform duration-300 ${
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
