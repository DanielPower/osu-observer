/**
 * Ingest every skin in resources/skins/ for the replay renderer.
 *
 * For each `.osk` (plus a generated `default` skin built from
 * resources/defaultSkin/), keeps only the files the renderer uses (SKIN_KEYS
 * images + SAMPLE_KEYS hitsounds), fills any the author omitted from the default
 * skin, and writes the result to app/media/skins/<id>.osk. Also writes a
 * skins.json manifest ([{ id, name }]) consumed by the options UI, where `name`
 * comes from each skin's skin.ini.
 *
 * Usage: pnpm --filter app ingest-skins
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader, ZipWriter } from "@zip.js/zip.js";
import { SKIN_KEYS, SAMPLE_KEYS } from "../../packages/osu-renderer/src/skin.ts";

const SOUND_EXTENSIONS = ["wav", "ogg", "mp3"] as const;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skinsInputDir = resolve(scriptDir, "../../resources/skins");
const defaultSkinDir = resolve(scriptDir, "../../resources/defaultSkin");
const outputDir = resolve(scriptDir, "../media/skins");

type SkinManifestEntry = { id: string; name: string; comboColors: number[] };

/** A source of a skin's files, keyed by lowercased filename. */
type SkinSource = {
  has: (lowerName: string) => boolean;
  read: (lowerName: string) => Promise<Uint8Array>;
  /** Raw skin.ini text, if present. */
  ini: string | null;
};

/**
 * Extract the display name ([General] Name) and combo colors ([Colours]
 * Combo1..N as packed RGB ints) from a skin.ini.
 */
function parseSkinIni(ini: string | null): { name: string | null; comboColors: number[] } {
  if (!ini) return { name: null, comboColors: [] };

  let name: string | null = null;
  const combos = new Map<number, number>();
  for (const line of ini.split(/\r?\n/)) {
    if (name === null) {
      const nameMatch = line.match(/^\s*Name\s*:\s*(.+?)\s*$/i);
      if (nameMatch) name = nameMatch[1];
    }
    const comboMatch = line.match(/^\s*Combo(\d+)\s*:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (comboMatch) {
      const [, index, r, g, b] = comboMatch;
      combos.set(
        Number(index),
        ((Number(r) & 0xff) << 16) + ((Number(g) & 0xff) << 8) + (Number(b) & 0xff),
      );
    }
  }

  const comboColors = [...combos.keys()].sort((a, b) => a - b).map((k) => combos.get(k)!);
  return { name, comboColors };
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "skin";
}

/** Build an optimized skin (needed renderer files, missing ones from default). */
async function buildOptimizedSkin(
  source: SkinSource,
): Promise<{ bytes: Uint8Array; kept: number; filled: number; missing: string[] }> {
  const specs: { name: string; read: () => Promise<Uint8Array> }[] = [];
  let kept = 0;
  let filled = 0;
  const missing: string[] = [];

  const resolveFile = (canonical: string, candidates: string[]): void => {
    const fromSkin = candidates.find((c) => source.has(c.toLowerCase()));
    if (fromSkin) {
      specs.push({ name: fromSkin, read: () => source.read(fromSkin.toLowerCase()) });
      kept++;
      return;
    }
    const fromDefault = candidates.find((c) => existsSync(`${defaultSkinDir}/${c}`));
    if (fromDefault) {
      specs.push({
        name: fromDefault,
        read: () => Promise.resolve(readFileSync(`${defaultSkinDir}/${fromDefault}`)),
      });
      filled++;
      return;
    }
    // No default equivalent (e.g. sliderstartcircle, which the renderer falls
    // back to hitcircle for). Leave it out.
    missing.push(canonical);
  };

  for (const key of SKIN_KEYS) resolveFile(`${key}.png`, [`${key}.png`]);
  for (const key of SAMPLE_KEYS) {
    resolveFile(
      `${key}.{wav,ogg,mp3}`,
      SOUND_EXTENSIONS.map((ext) => `${key}.${ext}`),
    );
  }

  // zip.js supports concurrent extraction with a random-access reader.
  const files = await Promise.all(
    specs.map(async (s) => ({ name: s.name, bytes: await s.read() })),
  );

  // A ZipWriter writes to a single stream, so entries must be added serially.
  const writer = new ZipWriter(new Uint8ArrayWriter());
  for (const file of files) {
    // oxlint-disable-next-line no-await-in-loop
    await writer.add(file.name, new Uint8ArrayReader(file.bytes));
  }
  return { bytes: await writer.close(), kept, filled, missing };
}

async function oskSource(
  oskPath: string,
): Promise<{ source: SkinSource; close: () => Promise<void> }> {
  const reader = new ZipReader(new Uint8ArrayReader(readFileSync(oskPath)));
  const entries = await reader.getEntries();
  const rootEntries = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) {
    if (entry.directory || entry.filename.includes("/")) continue;
    rootEntries.set(entry.filename.toLowerCase(), entry);
  }
  const iniEntry = rootEntries.get("skin.ini");
  const ini = iniEntry?.getData
    ? new TextDecoder().decode(await iniEntry.getData(new Uint8ArrayWriter()))
    : null;

  return {
    source: {
      has: (name) => rootEntries.has(name),
      read: (name) => rootEntries.get(name)!.getData!(new Uint8ArrayWriter()),
      ini,
    },
    close: () => reader.close(),
  };
}

function defaultDirSource(): SkinSource {
  const iniPath = `${defaultSkinDir}/skin.ini`;
  return {
    has: (name) => existsSync(`${defaultSkinDir}/${name}`),
    read: (name) => Promise.resolve(readFileSync(`${defaultSkinDir}/${name}`)),
    ini: existsSync(iniPath) ? readFileSync(iniPath, "utf8") : null,
  };
}

async function main() {
  if (!existsSync(skinsInputDir)) {
    console.error(`Skins input directory not found: ${skinsInputDir}`);
    process.exit(1);
  }

  // Regenerate the output directory's skins from scratch.
  mkdirSync(outputDir, { recursive: true });
  for (const file of readdirSync(outputDir)) {
    if (file.endsWith(".osk") || file === "skins.json") rmSync(`${outputDir}/${file}`);
  }

  const manifest: SkinManifestEntry[] = [];
  const usedIds = new Set<string>();
  const uniqueId = (base: string): string => {
    let id = base;
    let n = 2;
    while (usedIds.has(id)) id = `${base}-${n++}`;
    usedIds.add(id);
    return id;
  };

  const writeSkin = (id: string, bytes: Uint8Array) =>
    writeFileSync(`${outputDir}/${id}.osk`, bytes);

  // The bundled default skin (also the fill source), so `?skin=default` works.
  const defaultSource = defaultDirSource();
  const defaultResult = await buildOptimizedSkin(defaultSource);
  writeSkin("default", defaultResult.bytes);
  usedIds.add("default");
  manifest.push({
    id: "default",
    name: "Default",
    comboColors: parseSkinIni(defaultSource.ini).comboColors,
  });
  console.log(
    `default.osk (${(defaultResult.bytes.length / 1024).toFixed(0)} KB) ` +
      `kept ${defaultResult.kept}, filled ${defaultResult.filled}`,
  );

  // Assign ids up front (sequential dedup), then process each skin in parallel.
  const oskFiles = readdirSync(skinsInputDir).filter((f) => f.toLowerCase().endsWith(".osk"));
  const inputs = oskFiles.map((file) => {
    const name = basename(file, extname(file));
    return { file, name, id: uniqueId(slugify(name)) };
  });

  const processed = await Promise.all(
    inputs.map(async ({ file, name, id }) => {
      const { source, close } = await oskSource(`${skinsInputDir}/${file}`);
      const result = await buildOptimizedSkin(source);
      await close();
      const parsed = parseSkinIni(source.ini);
      return { id, name: parsed.name ?? name, comboColors: parsed.comboColors, result };
    }),
  );

  for (const { id, name, comboColors, result } of processed) {
    writeSkin(id, result.bytes);
    manifest.push({ id, name, comboColors });
    console.log(
      `${id}.osk (${(result.bytes.length / 1024).toFixed(0)} KB) ` +
        `kept ${result.kept}, filled ${result.filled}` +
        (result.missing.length ? `, omitted ${result.missing.length}` : ""),
    );
  }

  // Keep the default first; sort the rest by display name.
  const rest = manifest.slice(1).sort((a, b) => a.name.localeCompare(b.name));
  const ordered = [manifest[0], ...rest];
  writeFileSync(`${outputDir}/skins.json`, `${JSON.stringify(ordered, null, 2)}\n`);
  console.log(`\nWrote ${ordered.length} skins to ${outputDir} + skins.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
