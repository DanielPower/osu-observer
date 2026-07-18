import { BlobReader, BlobWriter, ZipReader } from "@zip.js/zip.js";

const resolvedSkins = new Map<string, Record<string, string>>();
const pendingSkins = new Map<string, Promise<Record<string, string>>>();

async function fetchWithProgress(
  url: string,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const response = await fetch(url);
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
  const blob = await fetchWithProgress(skinUrl, onProgress);

  const zipReader = new ZipReader(new BlobReader(blob));
  const entries = await zipReader.getEntries();

  const files: Record<string, string> = {};
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.directory || !entry.getData) return;
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
    pendingSkins.set(skinUrl, fetchAndExtract(skinUrl, onProgress));
  }
  return pendingSkins.get(skinUrl)!;
}
