// packages/osu-renderer/src/skin.ts

export const SKIN_KEYS = [
  "cursor",
  "cursormiddle",
  "hitcircle",
  "hitcircleoverlay",
  "approachcircle",
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

/**
 * A fully-decoded image bitmap. Using `ImageBitmap` instead of
 * `HTMLImageElement` ensures that `ctx.drawImage` never needs to re-read
 * the source URL at draw time, which prevents Chrome's `NotReadableError`
 * when the underlying blob is lazily decoded.
 */
export type SkinImages = Partial<Record<SkinKey, ImageBitmap>>;

/**
 * Loads each URL as a fully-decoded `ImageBitmap`. Silently skips any that
 * fail to load or decode.
 *
 * Uses `HTMLImageElement.decode()` rather than `fetch()` + `createImageBitmap(blob)`
 * because Chrome's `fetch(blobUrl)` path can throw `NotReadableError` for blobs
 * that were extracted from a zip (even when the data is valid). `decode()` goes
 * through the browser's native image pipeline and is immune to that issue.
 */
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

/**
 * Converts a Record<filename, url> map (as returned by skin loaders) into
 * a Partial<Record<SkinKey, string>> by stripping the `.png` extension and
 * discarding any names that are not valid SkinKeys.
 */
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
