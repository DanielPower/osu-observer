// packages/osu-renderer/src/skin.ts

export const SKIN_KEYS = [
  "cursor",
  "cursormiddle",
  "hitcircle",
  "hitcircleoverlay",
  "approachcircle",
  "scorebar-bg",
  "spinner-bottom",
  "spinner-middle",
  "spinner-top",
  "spinner-approachcircle",
  "sliderb",
  "sliderb-nd",
  "sliderb-spec",
  "sliderfollowcircle",
  "reversearrow",
  "sliderscorepoint",
  "sliderstartcircle",
  "sliderstartcircleoverlay",
  "sliderendcircle",
  "sliderendcircleoverlay",
  "hit0",
  "hit50",
  "hit100",
  "hit300",
  "default-0",
  "default-1",
  "default-2",
  "default-3",
  "default-4",
  "default-5",
  "default-6",
  "default-7",
  "default-8",
  "default-9",
  "score-0",
  "score-1",
  "score-2",
  "score-3",
  "score-4",
  "score-5",
  "score-6",
  "score-7",
  "score-8",
  "score-9",
  "score-dot",
  "score-percent",
  "score-x",
] as const;

export type SkinKey = (typeof SKIN_KEYS)[number];
export type SkinImages = Partial<Record<SkinKey, ImageBitmap>>;

export async function loadSkinImages(urls: Partial<Record<SkinKey, string>>): Promise<SkinImages> {
  const images: SkinImages = {};

  await Promise.all(
    (Object.entries(urls) as [SkinKey, string][]).map(async ([key, url]) => {
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        images[key] = await createImageBitmap(img);
      } catch {
        // silently skip failures
      }
    }),
  );

  return images;
}

export function skinFilesToImageUrls(
  files: Record<string, string>,
): Partial<Record<SkinKey, string>> {
  const skinKeySet = new Set<string>(SKIN_KEYS);
  const result: Partial<Record<SkinKey, string>> = {};

  for (const [filename, url] of Object.entries(files)) {
    const key = filename.replace(/\.png$/i, "");
    if (skinKeySet.has(key)) {
      result[key as SkinKey] = url;
    }
  }

  return result;
}

const SAMPLE_SETS = ["normal", "soft", "drum"] as const;
const SOUND_TYPES = [
  "hitnormal",
  "hitwhistle",
  "hitfinish",
  "hitclap",
  "sliderslide",
  "sliderwhistle",
  "slidertick",
] as const;

export type SampleKey = `${(typeof SAMPLE_SETS)[number]}-${(typeof SOUND_TYPES)[number]}`;
export type SkinSounds = Partial<Record<SampleKey, AudioBuffer>>;

export const SAMPLE_KEYS: SampleKey[] = SAMPLE_SETS.flatMap((set) =>
  SOUND_TYPES.map((type) => `${set}-${type}` as SampleKey),
);

// Audio extensions in lookup priority order (osu skins ship one format per skin).
const SOUND_EXTENSIONS = ["wav", "ogg", "mp3"] as const;

export async function loadSkinSounds(
  urls: Partial<Record<SampleKey, string>>,
  audioContext: AudioContext,
): Promise<SkinSounds> {
  const sounds: SkinSounds = {};

  await Promise.all(
    (Object.entries(urls) as [SampleKey, string][]).map(async ([key, url]) => {
      try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        sounds[key] = await audioContext.decodeAudioData(buffer);
      } catch {
        // Skip sounds that fail to decode. Skins routinely ship blank/silent
        // placeholder files to intentionally mute certain hitsounds; those fail
        // decodeAudioData and are correctly left silent.
      }
    }),
  );

  return sounds;
}

export function skinFilesToSoundUrls(
  files: Record<string, string>,
): Partial<Record<SampleKey, string>> {
  const sampleKeySet = new Set<string>(SAMPLE_KEYS);
  const result: Partial<Record<SampleKey, string>> = {};
  const chosenPriority: Partial<Record<SampleKey, number>> = {};

  for (const [filename, url] of Object.entries(files)) {
    // Only root-level entries; skips __MACOSX/… junk and unused hitsound/… subfolders.
    if (filename.includes("/")) continue;

    const dot = filename.lastIndexOf(".");
    if (dot < 0) continue;
    const base = filename.slice(0, dot);
    if (!sampleKeySet.has(base)) continue;

    const priority = SOUND_EXTENSIONS.indexOf(
      filename.slice(dot + 1).toLowerCase() as (typeof SOUND_EXTENSIONS)[number],
    );
    if (priority < 0) continue;

    const key = base as SampleKey;
    const existing = chosenPriority[key];
    if (existing === undefined || priority < existing) {
      chosenPriority[key] = priority;
      result[key] = url;
    }
  }

  return result;
}
