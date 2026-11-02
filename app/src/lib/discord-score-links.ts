// Lazer score links only. Legacy links (/scores/osu/<id>) carry a stable score's ID, which
// osu!observer doesn't support.
const SCORE_LINK = /https?:\/\/osu\.ppy\.sh\/scores\/(\d+)(?![\w/])/gi;
const MAX_LINKS_PER_MESSAGE = 5;

export function findScoreIds(content: string): string[] {
  const ids = new Set<string>();
  for (const match of content.matchAll(SCORE_LINK)) {
    ids.add(match[1]!);
    if (ids.size === MAX_LINKS_PER_MESSAGE) break;
  }
  return [...ids];
}
