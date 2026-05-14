import { useCallback, useEffect, useRef } from "react";
import Color from "colorjs.io";
import { generateAccentVars } from "../lib/accentVars";

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

export function useDynamicAccent(bgColor: string): void {
  const stateRef = useRef({
    current: new Map<string, RGBA>(),
    target: new Map<string, RGBA>(),
    startTime: 0,
    rafId: null as number | null,
    themeEl: null as HTMLElement | null,
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
    }
  }, []);

  useEffect(() => {
    const state = stateRef.current;
    if (!state.themeEl) {
      state.themeEl =
        (document.querySelector(".radix-themes") as HTMLElement | null) ?? document.documentElement;
    }

    const parsedTarget = new Map<string, RGBA>();
    generateAccentVars(bgColor).forEach((value, key) => {
      const parsed = parseColor(value);
      if (parsed) parsedTarget.set(key, parsed);
    });

    if (state.rafId !== null) cancelAnimationFrame(state.rafId);
    state.target = parsedTarget;
    state.startTime = performance.now();
    state.rafId = requestAnimationFrame(animate);
  }, [bgColor, animate]);

  useEffect(() => {
    return () => {
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      const { rafId } = stateRef.current;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);
}
