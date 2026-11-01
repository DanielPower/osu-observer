import { BlobReader, BlobWriter, ZipReader } from "@zip.js/zip.js";
import { SKIN_KEYS, SAMPLE_KEYS } from "./skin";

const SKIN_CACHE_NAME = "osu-skins-v1";
const NEEDED_IMAGE_NAMES = new Set(SKIN_KEYS.flatMap((key) => [`${key}.png`, `${key}@2x.png`]));
const NEEDED_SOUND_NAMES = new Set(
  SAMPLE_KEYS.flatMap((key) => [`${key}.wav`, `${key}.ogg`, `${key}.mp3`]),
);

// The renderer only uses a small subset of a skin archive (a handful of images
// plus hitsound files); everything else is skipped before decompression, since
// decompression is the expensive part of unzipping. Only root-level entries are
// considered (excludes __MACOSX/… junk and unused subfolders).
function isNeededSkinFile(filename: string): boolean {
  if (filename.includes("/")) return false;
  return NEEDED_IMAGE_NAMES.has(filename) || NEEDED_SOUND_NAMES.has(filename.toLowerCase());
}

const resolvedSkins = new Map<string, Record<string, string>>();
const pendingSkins = new Map<string, Promise<Record<string, string>>>();

async function getCachedSkinBlob(skinUrl: string): Promise<Blob | null> {
  try {
    const cache = await caches.open(SKIN_CACHE_NAME);
    const cached = await cache.match(skinUrl);
    return cached ? await cached.blob() : null;
  } catch {
    return null;
  }
}

// Skin URLs carry a content version (`?v=`), so a re-ingested skin gets a new
// cache entry. Older versions of the same skin are dropped when it's stored.
async function cacheSkinBlob(skinUrl: string, blob: Blob): Promise<void> {
  try {
    const cache = await caches.open(SKIN_CACHE_NAME);
    const path = new URL(skinUrl, location.href).pathname;
    const stale = (await cache.keys()).filter(
      (request) => new URL(request.url).pathname === path && request.url !== skinUrl,
    );
    await Promise.all(stale.map((request) => cache.delete(request)));
    await cache.put(skinUrl, new Response(blob));
  } catch {
    // Storage may be unavailable (private browsing, quota exceeded, etc.) - not fatal.
  }
}

async function fetchWithProgress(
  url: string,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const response = await fetch(url);
  // A failed response must never reach the cache, or the skin stays broken for good.
  if (!response.ok) throw new Error(`Skin download failed (HTTP ${response.status})`);
  const total = Number(response.headers.get("content-length")) || 0;

  if (!total || !response.body) {
    const blob = await response.blob();
    onProgress?.(1);
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    // Reading a single stream is inherently sequential, not parallelizable.
    // oxlint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received / total);
  }

  return new Blob(chunks as BlobPart[]);
}

async function fetchAndExtract(
  skinUrl: string,
  onProgress?: (fraction: number) => void,
): Promise<Record<string, string>> {
  let blob = await getCachedSkinBlob(skinUrl);
  if (blob) {
    onProgress?.(1);
  } else {
    blob = await fetchWithProgress(skinUrl, onProgress);
    await cacheSkinBlob(skinUrl, blob);
  }

  const zipReader = new ZipReader(new BlobReader(blob));
  const entries = await zipReader.getEntries();

  const files: Record<string, string> = {};
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.directory || !entry.getData || !isNeededSkinFile(entry.filename)) return;
      const entryBlob = await entry.getData(new BlobWriter());
      files[entry.filename] = URL.createObjectURL(entryBlob);
    }),
  );

  await zipReader.close();
  resolvedSkins.set(skinUrl, files);
  return files;
}

export function loadSkinFiles(
  skinUrl: string,
  onProgress?: (fraction: number) => void,
): Promise<Record<string, string>> {
  const resolved = resolvedSkins.get(skinUrl);
  if (resolved) {
    onProgress?.(1);
    return Promise.resolve(resolved);
  }

  if (!pendingSkins.has(skinUrl)) {
    const pending = fetchAndExtract(skinUrl, onProgress);
    pendingSkins.set(skinUrl, pending);
    // Forget a failed load so the next attempt retries it.
    pending.catch(() => pendingSkins.delete(skinUrl));
  }
  return pendingSkins.get(skinUrl)!;
}
