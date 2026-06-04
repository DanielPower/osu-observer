import { BlobReader, BlobWriter, ZipReader } from "@zip.js/zip.js";

const resolvedSkins = new Map<string, Record<string, string>>();
const pendingSkins = new Map<string, Promise<Record<string, string>>>();

async function fetchAndExtract(skinUrl: string): Promise<Record<string, string>> {
  const res = await fetch(skinUrl);
  const blob = await res.blob();

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

export function loadSkinFiles(skinUrl: string): Promise<Record<string, string>> {
  const resolved = resolvedSkins.get(skinUrl);
  if (resolved) return Promise.resolve(resolved);

  if (!pendingSkins.has(skinUrl)) {
    pendingSkins.set(skinUrl, fetchAndExtract(skinUrl));
  }
  return pendingSkins.get(skinUrl)!;
}
