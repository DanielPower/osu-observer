import { useEffect, useState } from "react";
import { getColor, getSwatches } from "colorthief";
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

const cache = new Map<string, React.CSSProperties>();

export function useDynamicAccent(
  imageUrl: string | undefined,
): React.CSSProperties | undefined {
  const [styles, setStyles] = useState<React.CSSProperties | undefined>(() =>
    imageUrl ? cache.get(imageUrl) : undefined,
  );

  useEffect(() => {
    if (!imageUrl) {
      setStyles(undefined);
      return;
    }

    const cached = cache.get(imageUrl);
    if (cached) {
      setStyles(cached);
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
        const cssVars = toCssVars(result);
        cache.set(imageUrl, cssVars);
        setStyles(cssVars);
      })
      .catch((err) => {
        console.warn("Dominant color extraction failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return styles;
}

function toCssVars(
  result: ReturnType<typeof generateRadixColors>,
): React.CSSProperties {
  const vars: Record<string, string> = {};
  result.accentScale.forEach((c, i) => {
    vars[`--accent-${i + 1}`] = c;
  });
  result.accentScaleAlpha.forEach((c, i) => {
    vars[`--accent-a${i + 1}`] = c;
  });
  result.grayScale.forEach((c, i) => {
    vars[`--gray-${i + 1}`] = c;
  });
  result.grayScaleAlpha.forEach((c, i) => {
    vars[`--gray-a${i + 1}`] = c;
  });
  vars["--accent-surface"] = result.accentSurface;
  vars["--accent-contrast"] = result.accentContrast;
  vars["--gray-surface"] = result.graySurface;
  return vars as React.CSSProperties;
}
