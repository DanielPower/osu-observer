import { generateRadixColors } from "./generate-radix-colors";

export const DEFAULT_ACCENT_COLOR = "#7c3aed";

const GRAY = "#8B8D98";
const BACKGROUND = "#111113";

export function generateAccentVars(color: string): Map<string, string> {
  const result = generateRadixColors({
    appearance: "dark",
    accent: color,
    gray: GRAY,
    background: BACKGROUND,
  });
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

export function accentVarsToCss(color: string): string {
  const vars = [...generateAccentVars(color).entries()].map(([k, v]) => `${k}:${v}`).join(";");
  return `.radix-themes{${vars}}`;
}
