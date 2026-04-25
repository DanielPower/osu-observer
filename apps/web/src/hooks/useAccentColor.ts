import { useMemo } from "react";
import { generateRadixColors } from "../lib/generate-radix-colors";

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

/**
 * Generate Radix CSS variable overrides from an accent hex color.
 * Returns undefined when no color is provided (uses theme defaults).
 */
export function useAccentColor(
  hex: string | null,
): React.CSSProperties | undefined {
  return useMemo(() => {
    if (!hex) return undefined;
    const result = generateRadixColors({
      appearance: "dark",
      accent: hex,
      gray: "#8B8D98",
      background: "#111113",
    });
    return toCssVars(result);
  }, [hex]);
}
