// Accepts a bare score ID or any osu! score URL, e.g. https://osu.ppy.sh/scores/1234567890.
export function parseScoreInput(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/scores\/(?:[a-z]+\/)?(\d+)/i);
  return match ? match[1]! : null;
}
