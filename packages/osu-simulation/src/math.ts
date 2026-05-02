export const PLAYFIELD = {
  width: 512,
  height: 384,
  centerX: 256,
  centerY: 192,
} as const;

export function calcObjectRadius(CS: number) {
  return 32 * (1 - (0.7 * (CS - 5)) / 5);
}
