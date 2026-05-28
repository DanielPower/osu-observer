import { unzip } from "unzipit";

const resolvedSkins = new Map<string, Record<string, string>>();
const pendingSkins = new Map<string, Promise<Record<string, string>>>();

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
      try {
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
