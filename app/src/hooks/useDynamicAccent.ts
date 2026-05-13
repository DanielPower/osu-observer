import { useCallback, useEffect, useRef } from "react";
import { getColor, getSwatches } from "colorthief";
import Color from "colorjs.io";
import { generateRadixColors } from "../lib/generate-radix-colors";

const SWATCH_PRIORITY = [
  "Vibrant",
  "LightVibrant",
  "DarkVibrant",
  "Muted",
  "DarkMuted",
  "LightMuted",
] as const;

async function pickAccent(img: HTMLImageElement): Promise<string | null> {
  const swatches = await getSwatches(img);
  for (const role of SWATCH_PRIORITY) {
    const swatch = swatches[role];
    if (swatch) return swatch.color.hex();
  }
  const fallback = await getColor(img);
  return fallback?.hex() ?? null;
}

const cache = new Map<string, Map<string, string>>();

const DURATION = 1000;

type RGBA = [number, number, number, number];

function parseColor(str: string): RGBA | null {
  try {
    const c = new Color(str).to("srgb");
    return [
      Math.max(0, Math.min(1, c.coords[0] ?? 0)),
      Math.max(0, Math.min(1, c.coords[1] ?? 0)),
      Math.max(0, Math.min(1, c.coords[2] ?? 0)),
      Math.max(0, Math.min(1, c.alpha ?? 1)),
    ];
  } catch {
    return null;
  }
}

function toHexByte(v: number): string {
  return Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, "0");
}

function rgbaToString([r, g, b, a]: RGBA): string {
  const base = `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
  return a >= 1 ? base : `${base}${toHexByte(a)}`;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function toCssVarStrings(result: ReturnType<typeof generateRadixColors>): Map<string, string> {
  const vars = new Map<string, string>();
  result.accentScale.forEach((c, i) => vars.set(`--accent-${i + 1}`, c));
  result.accentScaleAlpha.forEach((c, i) => vars.set(`--accent-a${i + 1}`, c));
  result.grayScale.forEach((c, i) => vars.set(`--gray-${i + 1}`, c));
  result.grayScaleAlpha.forEach((c, i) => vars.set(`--gray-a${i + 1}`, c));
  vars.set("--accent-surface", result.accentSurface);
  vars.set("--accent-contrast", result.accentContrast);
  vars.set("--gray-surface", result.graySurface);
  return vars;
}

export function useDynamicAccent(imageUrl: string | undefined): void {
  const stateRef = useRef({
    current: new Map<string, RGBA>(),
    target: new Map<string, RGBA>(),
    defaults: null as Map<string, RGBA> | null,
    startTime: 0,
    rafId: null as number | null,
    themeEl: null as HTMLElement | null,
    returningToDefault: false,
  });

  const animate = useCallback((timestamp: number) => {
    const state = stateRef.current;
    const el = state.themeEl ?? document.documentElement;
    const t = easeInOut(Math.min(1, (timestamp - state.startTime) / DURATION));

    state.target.forEach((to, key) => {
      const from = state.current.get(key) ?? to;
      const interpolated: RGBA = [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
        from[3] + (to[3] - from[3]) * t,
      ];
      state.current.set(key, interpolated);
      el.style.setProperty(key, rgbaToString(interpolated));
    });

    if (t < 1) {
      state.rafId = requestAnimationFrame(animate);
    } else if (state.returningToDefault) {
      // Let Radix's stylesheet values take over again
      state.target.forEach((_, key) => el.style.removeProperty(key));
      state.current = new Map(state.defaults!);
      state.returningToDefault = false;
    }
  }, []);

  useEffect(() => {
    if (!imageUrl) {
      const state = stateRef.current;
      if (!state.themeEl || !state.defaults) return;
      if (state.rafId !== null) cancelAnimationFrame(state.rafId);
      state.target = new Map(state.defaults);
      state.returningToDefault = true;
      state.startTime = performance.now();
      state.rafId = requestAnimationFrame(animate);
      return;
    }

    const startAnimation = (vars: Map<string, string>) => {
      const state = stateRef.current;

      if (!state.themeEl) {
        const el =
          (document.querySelector(".radix-themes") as HTMLElement | null) ??
          document.documentElement;
        state.themeEl = el;

        // Snapshot Radix's default CSS var values before we ever write anything
        const computed = getComputedStyle(el);
        const defaults = new Map<string, RGBA>();
        vars.forEach((_, key) => {
          const val = computed.getPropertyValue(key).trim();
          if (val) {
            const parsed = parseColor(val);
            if (parsed) defaults.set(key, parsed);
          }
        });
        state.defaults = defaults;
      }

      const parsedTarget = new Map<string, RGBA>();
      vars.forEach((value, key) => {
        const parsed = parseColor(value);
        if (parsed) parsedTarget.set(key, parsed);
      });

      if (state.rafId !== null) cancelAnimationFrame(state.rafId);
      state.returningToDefault = false;
      state.target = parsedTarget;
      state.startTime = performance.now();
      state.rafId = requestAnimationFrame(animate);
    };

    const cached = cache.get(imageUrl);
    if (cached) {
      startAnimation(cached);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;

    img
      .decode()
      .then(() => pickAccent(img))
      .then((accent) => {
        if (cancelled || !accent) return;
        const result = generateRadixColors({
          appearance: "dark",
          accent,
          gray: "#8B8D98",
          background: "#111113",
        });
        const vars = toCssVarStrings(result);
        cache.set(imageUrl, vars);
        startAnimation(vars);
      })
      .catch((err) => {
        console.warn("Dominant color extraction failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [imageUrl, animate]);

  useEffect(() => {
    return () => {
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      const { rafId } = stateRef.current;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);
}
