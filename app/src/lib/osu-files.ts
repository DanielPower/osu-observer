import { BeatmapDecoder, ScoreDecoder } from "osu-parsers";

const beatmapDecoder = new BeatmapDecoder();
const scoreDecoder = new ScoreDecoder();

async function fetchWithProgress(
  url: string,
  onProgress?: (fraction: number) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  const total = Number(response.headers.get("content-length")) || 0;

  if (!total || !response.body) {
    const buffer = await response.arrayBuffer();
    onProgress?.(1);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    // Reading a single stream is inherently sequential, not parallelizable.
    // oxlint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received / total);
  }

  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  return buffer.buffer;
}

export const readBeatmap = async (url: string, onProgress?: (fraction: number) => void) => {
  const buffer = await fetchWithProgress(url, onProgress);
  return beatmapDecoder.decodeFromBuffer(buffer);
};

export const readScore = async (url: string) => {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const score = await scoreDecoder.decodeFromBuffer(buffer, true);
  return score;
};

export const readAudio = async (url: string, onProgress?: (fraction: number) => void) => {
  const buffer = await fetchWithProgress(url, onProgress);
  const audioUrl = URL.createObjectURL(new Blob([buffer]));
  const audio = new Audio(audioUrl);
  return audio;
};
