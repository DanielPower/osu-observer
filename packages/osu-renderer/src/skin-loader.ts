import { unzip } from "unzipit";

// Resolved skins are kept for the lifetime of the page. This lets us:
//   1. Return synchronously on re-mount (no empty state flash)
//   2. Skip re-extraction when the same URL is requested again
const resolvedSkins = new Map<string, Record<string, string>>();

// Tracks in-flight extractions so concurrent calls for the same URL
// share one fetch+unzip rather than duplicating the work.
const pendingSkins = new Map<string, Promise<Record<string, string>>>();

async function fetchAndExtract(skinUrl: string): Promise<Record<string, string>> {
  const res = await fetch(skinUrl);
  const blob = await res.blob();
  const { entries } = await unzip(blob);

  const files: Record<string, string> = {};
  await Promise.all(
    Object.entries(entries).map(async ([filename, entry]) => {
      const fileBlob = await entry.blob();
      const url = URL.createObjectURL(fileBlob);
      // Strip any directory prefix (some .osk files nest files in subdirectories)
      const basename = filename.split("/").pop() ?? filename;
      files[basename] = url;
    }),
  );

  resolvedSkins.set(skinUrl, files);
  return files;
}

export function loadSkinFiles(skinUrl: string): Promise<Record<string, string>> {
  const resolved = resolvedSkins.get(skinUrl);
  if (resolved) return Promise.resolve(resolved);

  if (!pendingSkins.has(skinUrl)) {
    pendingSkins.set(skinUrl, fetchAndExtract(skinUrl));
  }
  return pendingSkins.get(skinUrl)!;
}

export function getSkinFilesSync(skinUrl: string): Record<string, string> | undefined {
  return resolvedSkins.get(skinUrl);
}
