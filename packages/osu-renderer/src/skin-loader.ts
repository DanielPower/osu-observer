import { unzip } from "unzipit";

// Resolved skins are kept for the lifetime of the page. This lets us:
//   1. Return synchronously on re-mount (no empty state flash)
//   2. Skip re-extraction when the same URL is requested again
const resolvedSkins = new Map<string, Record<string, string>>();

// Tracks in-flight extractions so concurrent calls for the same URL
// share one fetch+unzip rather than duplicating the work.
const pendingSkins = new Map<string, Promise<Record<string, string>>>();

/**
 * Returns an appropriate image/* MIME type for a given filename, falling back
 * to application/octet-stream for unknown extensions.
 */
function mimeTypeForFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

async function fetchAndExtract(skinUrl: string): Promise<Record<string, string>> {
  const res = await fetch(skinUrl);
  const blob = await res.blob();
  const { entries } = await unzip(blob);

  const files: Record<string, string> = {};
  await Promise.all(
    Object.entries(entries).map(async ([filename, entry]) => {
      // Strip any directory prefix (some .osk files nest files in subdirectories)
      try {
        // Read raw bytes immediately rather than using entry.blob().
        // entry.blob() returns a lazy Blob whose backing stream may be released
        // before Chrome reads it; this causes NotReadableError when the blob URL
        // is later fetched or drawn. Reading into an ArrayBuffer now and wrapping
        // it in a new Blob guarantees the data is fully owned and always readable.
        // Also, entry.blob() returns type:"", which Chrome's createImageBitmap
        // rejects; we derive the correct MIME type from the file extension.
        const arrayBuffer = await entry.arrayBuffer();
        const materialBlob = new Blob([arrayBuffer], { type: mimeTypeForFilename(filename) });
        const url = URL.createObjectURL(materialBlob);
        files[filename] = url;
      } catch {
        // Skip corrupt or unreadable entries — a missing skin element is
        // preferable to the entire skin load failing.
      }
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
