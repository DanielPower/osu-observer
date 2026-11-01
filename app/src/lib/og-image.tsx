import type { ReactNode } from "react";
import satori from "satori";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm?url&inline";
import outfit500 from "@fontsource/outfit/files/outfit-latin-500-normal.woff?inline";
import outfit700 from "@fontsource/outfit/files/outfit-latin-700-normal.woff?inline";
import outfit800 from "@fontsource/outfit/files/outfit-latin-800-normal.woff?inline";
import outfitExt500 from "@fontsource/outfit/files/outfit-latin-ext-500-normal.woff?inline";
import outfitExt700 from "@fontsource/outfit/files/outfit-latin-ext-700-normal.woff?inline";
import outfitExt800 from "@fontsource/outfit/files/outfit-latin-ext-800-normal.woff?inline";
import { DEFAULT_ACCENT_COLOR, generateAccentVars } from "./accentVars";
import { GRADES, MOD_COLORS } from "./grade-colors";
import { formatAccuracy, formatInteger, visibleMods, type ScoreStats } from "./link-preview";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
const BACKGROUND = "#121016";

// Vite inlines these as data URLs, so the fonts and wasm ship inside the server bundle.
const decodeDataUrl = (dataUrl: string) =>
  Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");

let ready: Promise<void> | null = null;
function init() {
  ready ??= initWasm(decodeDataUrl(resvgWasm));
  return ready;
}

const fonts = [
  [outfit500, 500],
  [outfit700, 700],
  [outfit800, 800],
  [outfitExt500, 500],
  [outfitExt700, 700],
  [outfitExt800, 800],
].map(([data, weight]) => ({
  name: "Outfit",
  data: decodeDataUrl(data as string),
  weight: weight as 500 | 700 | 800,
  style: "normal" as const,
}));

export async function renderPng(element: ReactNode) {
  await init();
  const svg = await satori(element, { width: OG_WIDTH, height: OG_HEIGHT, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render().asPng();
  // Copied into its own ArrayBuffer so it can be a Response body.
  return new Uint8Array(png);
}

export function imageDataUrl(bytes: Uint8Array, contentType: string) {
  return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
}

// Images satori can't measure would fail the whole card, so only known types are used.
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export async function fetchImage(url: string, timeoutMs = 3000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!response.ok || !IMAGE_TYPES.includes(contentType)) return null;
    return imageDataUrl(new Uint8Array(await response.arrayBuffer()), contentType);
  } catch {
    return null;
  }
}

function palette(color: string | null | undefined) {
  const vars = generateAccentVars(color ?? DEFAULT_ACCENT_COLOR);
  return { solid: vars.get("--accent-9")!, text: vars.get("--accent-11")! };
}

function LogoMark({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="13.5" fill="none" stroke={color} strokeWidth="3.5" />
      <circle cx="16" cy="16" r="7" fill={color} />
      <circle cx="16" cy="16" r="2.75" fill={BACKGROUND} />
    </svg>
  );
}

function Brand({ accent, size = 34 }: { accent: { solid: string; text: string }; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.35 }}>
      <LogoMark size={size * 1.2} color={accent.solid} />
      <div style={{ display: "flex", fontSize: size, fontWeight: 700, color: "#f1eef5" }}>
        osu!<span style={{ color: accent.text }}>observer</span>
      </div>
    </div>
  );
}

function Frame({
  accent,
  backgroundImage,
  children,
}: {
  accent: { solid: string; text: string };
  backgroundImage?: string | null;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: "flex",
        position: "relative",
        backgroundColor: BACKGROUND,
        fontFamily: "Outfit",
        color: "#f1eef5",
      }}
    >
      {backgroundImage && (
        <img
          src={backgroundImage}
          width={OG_WIDTH}
          height={OG_HEIGHT}
          style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}
        />
      )}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: OG_WIDTH,
          height: OG_HEIGHT,
          display: "flex",
          backgroundImage: backgroundImage
            ? "linear-gradient(90deg, rgba(18,16,22,0.95) 0%, rgba(18,16,22,0.85) 55%, rgba(18,16,22,0.6) 100%)"
            : `radial-gradient(900px 500px at 0% 0%, ${accent.solid}55, transparent), radial-gradient(800px 500px at 100% 100%, ${accent.solid}33, transparent)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: OG_WIDTH,
          height: 10,
          backgroundColor: accent.solid,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 52,
          left: 64,
          width: OG_WIDTH - 128,
          height: OG_HEIGHT - 108,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Avatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  return src ? (
    <img
      src={src}
      width={size}
      height={size}
      style={{
        borderRadius: size / 2,
        border: "3px solid rgba(255,255,255,0.15)",
        objectFit: "cover",
      }}
    />
  ) : (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#2a2631",
        fontSize: size * 0.45,
        fontWeight: 700,
      }}
    >
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 500,
          color: "#a9a3b5",
          textTransform: "uppercase",
          letterSpacing: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 46, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

export type ScoreCard = {
  username: string;
  avatar: string | null;
  beatmap: { title: string; artist: string; version: string; creator: string };
  background: string | null;
  accentColor: string | null;
  stats: ScoreStats;
  mods: string[];
};

export function ScoreCardImage({ card }: { card: ScoreCard }) {
  const accent = palette(card.accentColor);
  const grade = card.stats.rank ? GRADES[card.stats.rank] : undefined;
  const mods = visibleMods(card.mods);
  const stats = [
    card.stats.accuracy !== null && {
      label: "Accuracy",
      value: formatAccuracy(card.stats.accuracy),
    },
    card.stats.pp !== null && { label: "pp", value: formatInteger(Math.round(card.stats.pp)) },
    card.stats.maxCombo !== null && {
      label: "Combo",
      value: `${formatInteger(card.stats.maxCombo)}x`,
    },
    card.stats.totalScore !== null && {
      label: "Score",
      value: formatInteger(card.stats.totalScore),
    },
  ].filter((stat): stat is { label: string; value: string } => Boolean(stat));

  return (
    <Frame accent={accent} backgroundImage={card.background}>
      <Brand accent={accent} />
      <div style={{ display: "flex", flexDirection: "column", marginTop: 28, maxWidth: 860 }}>
        <div
          style={{
            display: "block",
            fontSize: 54,
            fontWeight: 800,
            lineHeight: 1.08,
            lineClamp: 2,
          }}
        >
          {card.beatmap.title}
        </div>
        <div
          style={{ display: "block", fontSize: 30, color: "#cfc9da", marginTop: 6, lineClamp: 1 }}
        >
          {card.beatmap.artist}
        </div>
        <div
          style={{
            display: "block",
            fontSize: 28,
            color: accent.text,
            fontWeight: 700,
            marginTop: 6,
            lineClamp: 1,
          }}
        >
          {`[${card.beatmap.version}] · mapped by ${card.beatmap.creator}`}
        </div>
      </div>
      <div style={{ display: "flex", flexGrow: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <Avatar src={card.avatar} name={card.username} size={72} />
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>{card.username}</div>
        <div style={{ display: "flex", gap: 10, marginLeft: 8 }}>
          {mods.map((mod) => (
            <div
              key={mod}
              style={{
                display: "flex",
                padding: "4px 14px",
                borderRadius: 10,
                fontSize: 26,
                fontWeight: 800,
                backgroundColor: MOD_COLORS[mod] ?? "#b6b0c2",
                color: "#120e17",
              }}
            >
              {mod}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 56, marginTop: 20 }}>
        {stats.map((stat) => (
          <Stat key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>
      {grade && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 98,
            width: 190,
            height: 190,
            borderRadius: 52,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: grade.bg,
            border: `4px solid ${grade.color}`,
            color: grade.color,
            fontSize: 110,
            fontWeight: 800,
          }}
        >
          {grade.label}
        </div>
      )}
    </Frame>
  );
}

export type SpeedrunCard = {
  kindLabel: string;
  title: string;
  live: boolean;
  playerCount: number;
  standings: { rank: number; username: string; avatar: string | null; totalPp: string }[];
};

const PODIUM_COLORS = ["#ffd75e", "#cfd6e2", "#e0a070"];

export function SpeedrunCardImage({ card }: { card: SpeedrunCard }) {
  const accent = palette(null);
  return (
    <Frame accent={accent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Brand accent={accent} />
        <div
          style={{
            display: "flex",
            padding: "6px 20px",
            borderRadius: 999,
            fontSize: 26,
            fontWeight: 700,
            backgroundColor: card.live ? accent.solid : "#2a2631",
            color: card.live ? "#120e17" : "#cfc9da",
          }}
        >
          {card.live ? "LIVE" : "FINAL"}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 800 }}>
          {`${card.kindLabel} speedrun`}
        </div>
        <div style={{ display: "flex", fontSize: 32, color: accent.text, fontWeight: 700 }}>
          {`${card.title} · ${formatInteger(card.playerCount)} ${card.playerCount === 1 ? "player" : "players"}`}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 36 }}>
        {card.standings.length === 0 && (
          <div style={{ display: "flex", fontSize: 34, color: "#a9a3b5" }}>No plays yet</div>
        )}
        {card.standings.map((standing, i) => (
          <div
            key={standing.rank}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              padding: "12px 24px",
              borderRadius: 20,
              backgroundColor: "rgba(255,255,255,0.05)",
              width: 900,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 60,
                fontSize: 40,
                fontWeight: 800,
                color: PODIUM_COLORS[i] ?? "#cfc9da",
              }}
            >
              {`#${standing.rank}`}
            </div>
            <Avatar src={standing.avatar} name={standing.username} size={64} />
            <div style={{ display: "flex", flexGrow: 1, fontSize: 38, fontWeight: 700 }}>
              {standing.username}
            </div>
            <div style={{ display: "flex", fontSize: 38, fontWeight: 800 }}>
              {standing.totalPp}
              <span style={{ color: "#a9a3b5", marginLeft: 6, fontWeight: 500 }}>pp</span>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function SiteCardImage() {
  const accent = palette(null);
  return (
    <Frame accent={accent}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flexGrow: 1,
          gap: 28,
        }}
      >
        <Brand accent={accent} size={96} />
        <div
          style={{
            display: "flex",
            fontSize: 36,
            color: "#cfc9da",
            textAlign: "center",
            maxWidth: 900,
          }}
        >
          Watch osu! replays in your browser and follow pp speedruns.
        </div>
      </div>
    </Frame>
  );
}
