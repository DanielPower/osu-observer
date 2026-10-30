import { useEffect, useState } from "react";

export type PlayerSettings = {
  musicVolume: number;
  effectsVolume: number;
  backgroundDim: number;
  playbackSpeed: number;
  useBeatmapComboColors: boolean;
  cursorAnalysis: boolean;
};

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  musicVolume: 0.5,
  effectsVolume: 0.5,
  backgroundDim: 0.5,
  playbackSpeed: 1,
  useBeatmapComboColors: true,
  cursorAnalysis: false,
};

export const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2];

const STORAGE_KEY = "observer:player-settings";

function readStoredSettings(): PlayerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PLAYER_SETTINGS;
    return { ...DEFAULT_PLAYER_SETTINGS, ...(JSON.parse(raw) as Partial<PlayerSettings>) };
  } catch {
    return DEFAULT_PLAYER_SETTINGS;
  }
}

// Settings start at the defaults so the server render matches, then load from storage after mount.
export function usePlayerSettings() {
  const [settings, setSettings] = useState(DEFAULT_PLAYER_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSettings(readStoredSettings());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage can be unavailable (private mode, blocked site data); settings then last for the page.
    }
  }, [settings, loaded]);

  const update = (patch: Partial<PlayerSettings>) => setSettings((prev) => ({ ...prev, ...patch }));
  const reset = () => setSettings(DEFAULT_PLAYER_SETTINGS);

  return { settings, loaded, update, reset };
}
