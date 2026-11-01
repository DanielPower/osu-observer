// packages/osu-renderer/src/skin.ts

/** How many scorebar-colour-N animation frames a skin can provide. */
export const SCOREBAR_COLOUR_FRAMES = 60;

const SCOREBAR_COLOUR_FRAME_KEYS = Array.from(
  { length: SCOREBAR_COLOUR_FRAMES },
  (_, i) => `scorebar-colour-${i}` as const,
);

export const SKIN_KEYS = [
  "cursor",
  "cursormiddle",
  "cursortrail",
  "cursor-smoke",
  "hitcircle",
  "hitcircleoverlay",
  "approachcircle",
  "scorebar-bg",
  "scorebar-colour",
  ...SCOREBAR_COLOUR_FRAME_KEYS,
  "scorebar-ki",
  "scorebar-kidanger",
  "scorebar-kidanger2",
  "scorebar-marker",
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
  "sliderendmiss",
  "slidertickmiss",
  "lighting",
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

/** A skin image's URL, and its pixel density: 2 for an `@2x` image, which is drawn at half size. */
export type SkinImageSource = { url: string; density: number };

const imageDensity = new WeakMap<ImageBitmap, number>();

/**
 * The size a skin image is drawn at, in 1x skin pixels: an `@2x` image counts as
 * half its pixel size, as in osu!.
 */
export function skinImageSize(image: ImageBitmap): { width: number; height: number } {
  const density = imageDensity.get(image) ?? 1;
  return { width: image.width / density, height: image.height / density };
}

export async function loadSkinImages(
  sources: Partial<Record<SkinKey, string | SkinImageSource>>,
): Promise<SkinImages> {
  const images: SkinImages = {};

  await Promise.all(
    (Object.entries(sources) as [SkinKey, string | SkinImageSource][]).map(
      async ([key, source]) => {
        const { url, density } = typeof source === "string" ? { url: source, density: 1 } : source;
        try {
          const img = new Image();
          img.src = url;
          await img.decode();
          const bitmap = await createImageBitmap(img);
          imageDensity.set(bitmap, density);
          images[key] = bitmap;
        } catch {
          // silently skip failures
        }
      },
    ),
  );

  return images;
}

/** The skin's image for each key, preferring `@2x` over 1x as osu! does. */
export function skinFilesToImageUrls(
  files: Record<string, string>,
): Partial<Record<SkinKey, SkinImageSource>> {
  const skinKeySet = new Set<string>(SKIN_KEYS);
  const result: Partial<Record<SkinKey, SkinImageSource>> = {};

  for (const [filename, url] of Object.entries(files)) {
    const match = filename.match(/^(.+?)(@2x)?\.png$/i);
    if (!match || !skinKeySet.has(match[1])) continue;
    const key = match[1] as SkinKey;
    const density = match[2] ? 2 : 1;
    if ((result[key]?.density ?? 0) < density) result[key] = { url, density };
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

// Spinner sounds aren't bank-prefixed in legacy skins (lazer falls back from
// `{bank}-spinnerspin` to `spinnerspin`, and from `spinnerbonus-max` to `spinnerbonus`).
const UNBANKED_SOUNDS = ["spinnerspin", "spinnerbonus", "spinnerbonus-max"] as const;

export type SampleKey =
  | `${(typeof SAMPLE_SETS)[number]}-${(typeof SOUND_TYPES)[number]}`
  | (typeof UNBANKED_SOUNDS)[number];
export type SkinSounds = Partial<Record<SampleKey, AudioBuffer>>;

export const SAMPLE_KEYS: SampleKey[] = [
  ...SAMPLE_SETS.flatMap((set) => SOUND_TYPES.map((type) => `${set}-${type}` as SampleKey)),
  ...UNBANKED_SOUNDS,
];

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

/** The skin.ini [General] settings that change how the cursor and its trail are drawn. */
export type CursorConfig = {
  centre: boolean;
  rotate: boolean;
  expand: boolean;
  trailRotate: boolean;
};

export const DEFAULT_CURSOR_CONFIG: CursorConfig = {
  centre: true,
  rotate: true,
  expand: true,
  trailRotate: true,
};

const CURSOR_CONFIG_KEYS: Record<string, keyof CursorConfig> = {
  cursorcentre: "centre",
  cursorrotate: "rotate",
  cursorexpand: "expand",
  cursortrailrotate: "trailRotate",
};

// Parses as lazer's LegacySkin does: "true"/"false", or a number that is true unless 0.
function parseSkinBool(value: string): boolean | undefined {
  const lower = value.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  const number = Number.parseInt(value, 10);
  return Number.isNaN(number) ? undefined : number !== 0;
}

export function parseCursorConfig(ini: string | null): CursorConfig {
  const config = { ...DEFAULT_CURSOR_CONFIG };
  if (!ini) return config;
  let section = "";
  for (const line of ini.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      section = trimmed.toLowerCase();
      continue;
    }
    if (section !== "[general]") continue;
    const match = trimmed.match(/^([^:]+):(.*)$/);
    if (!match) continue;
    const key = CURSOR_CONFIG_KEYS[match[1].trim().toLowerCase()];
    const value = parseSkinBool(match[2].trim());
    if (key && value !== undefined) config[key] = value;
  }
  return config;
}

/** The skin.ini settings that change how hit objects are drawn. */
export type HitObjectConfig = {
  /** The skin's [General] Version, Infinity for "latest". */
  version: number;
  /** [Fonts] HitCircleOverlap: how far the combo number's digits overlap, in skin pixels. */
  hitCircleOverlap: number;
  /** [General] AllowSliderBallTint: whether the slider ball takes the combo colour. */
  allowSliderBallTint: boolean;
  /** [Colours] SliderBall, the ball's colour when it isn't tinted. */
  sliderBallColour: number;
};

/** A skin without a skin.ini, as lazer treats one. */
export const DEFAULT_HIT_OBJECT_CONFIG: HitObjectConfig = {
  version: Infinity,
  hitCircleOverlap: -2,
  allowSliderBallTint: false,
  sliderBallColour: 0xffffff,
};

function iniEntries(ini: string): { section: string; key: string; value: string }[] {
  const entries: { section: string; key: string; value: string }[] = [];
  let section = "";
  for (const line of ini.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      section = trimmed.toLowerCase();
      continue;
    }
    const match = trimmed.match(/^([^:]+):(.*)$/);
    if (match)
      entries.push({ section, key: match[1].trim().toLowerCase(), value: match[2].trim() });
  }
  return entries;
}

/**
 * The skin's version as lazer reads it: "latest" without a skin.ini, 1.0 for an ini
 * that leaves Version out.
 */
export function legacySkinVersion(ini: string | null): number {
  if (!ini) return Infinity;
  const entry = iniEntries(ini).find((e) => e.section === "[general]" && e.key === "version");
  if (!entry) return 1;
  if (entry.value.toLowerCase() === "latest") return Infinity;
  const version = Number.parseFloat(entry.value);
  return Number.isNaN(version) ? 1 : version;
}

/**
 * Reads the hit object settings from the renderer's skin.ini, which the ingest
 * writes. A missing Version means "latest" here: the ingest always writes the
 * skin's own version (see legacySkinVersion).
 */
export function parseHitObjectConfig(ini: string | null): HitObjectConfig {
  const config = { ...DEFAULT_HIT_OBJECT_CONFIG };
  if (!ini) return config;
  for (const { section, key, value } of iniEntries(ini)) {
    if (section === "[general]" && key === "version") {
      const version = Number.parseFloat(value);
      if (value.toLowerCase() === "latest") config.version = Infinity;
      else if (!Number.isNaN(version)) config.version = version;
    } else if (section === "[general]" && key === "allowsliderballtint") {
      config.allowSliderBallTint = parseSkinBool(value) ?? config.allowSliderBallTint;
    } else if (section === "[fonts]" && key === "hitcircleoverlap") {
      const overlap = Number.parseInt(value, 10);
      if (!Number.isNaN(overlap)) config.hitCircleOverlap = overlap;
    } else if (section === "[colours]" && key === "sliderball") {
      const parts = value.split(",").map((part) => Number.parseInt(part, 10));
      if (parts.length >= 3 && parts.slice(0, 3).every((part) => !Number.isNaN(part))) {
        config.sliderBallColour =
          ((parts[0] & 0xff) << 16) | ((parts[1] & 0xff) << 8) | (parts[2] & 0xff);
      }
    }
  }
  return config;
}
