import { LegacyReplayFrame, LifeBarFrame, Replay, type Score, Vector2 } from "osu-classes";
import { ScoreDecoder } from "osu-parsers";
import { decompress } from "lzma1";

const scoreDecoder = new ScoreDecoder();
const textDecoder = new TextDecoder();

// Fields of the .osr header that osu-parsers reads but doesn't expose without
// also decompressing the replay.
type ReplayHeader = {
  gameVersion: number;
  replayHashMD5: string;
  lifeData: string;
  compressedReplay: Uint8Array;
};

function readReplayHeader(bytes: Uint8Array): ReplayHeader {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const readString = (): string => {
    if (bytes[offset++] !== 0x0b) return "";
    let length = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = bytes[offset++];
      length |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    const value = textDecoder.decode(bytes.subarray(offset, offset + length));
    offset += length;
    return value;
  };

  offset += 1; // ruleset
  const gameVersion = view.getInt32(offset, true);
  offset += 4;
  readString(); // beatmap MD5
  readString(); // username
  const replayHashMD5 = readString();
  offset += 6 * 2 + 4 + 2 + 1 + 4; // hit counts, total score, max combo, perfect, mods
  const lifeData = readString();
  offset += 8; // date
  const replayLength = view.getInt32(offset, true);
  offset += 4;

  return {
    gameVersion,
    replayHashMD5,
    lifeData,
    compressedReplay: bytes.subarray(offset, offset + Math.max(0, replayLength)),
  };
}

function parseNumber(value: string, parse: (value: string) => number): number {
  const number = parse(value);
  if (Number.isNaN(number)) throw new Error(`Invalid replay value: ${value}`);
  return number;
}

// Mirrors osu-parsers' ReplayDecoder.decodeReplayFrames.
function decodeLegacyReplayFrames(data: string): LegacyReplayFrame[] {
  const replayFrames: LegacyReplayFrame[] = [];
  const frames = data.split(",");
  let lastTime = 0;

  for (let i = 0; i < frames.length; i++) {
    if (!frames[i]) continue;
    const frameData = frames[i].split("|");
    if (frameData.length < 4 || frameData[0] === "-12345") continue;

    const replayFrame = new LegacyReplayFrame(
      0,
      parseNumber(frameData[0], parseFloat),
      new Vector2(parseNumber(frameData[1], parseFloat), parseNumber(frameData[2], parseFloat)),
      parseNumber(frameData[3], parseInt),
    );
    lastTime += replayFrame.interval;

    if (i < 2 && replayFrame.mouseX === 256 && replayFrame.mouseY === -500) continue;
    if (replayFrame.interval < 0) continue;

    replayFrame.startTime = lastTime;
    replayFrames.push(replayFrame);
  }

  return replayFrames;
}

function decodeLifeBar(data: string): LifeBarFrame[] {
  return data
    .split(",")
    .map((frame) => frame.split("|"))
    .filter((frameData) => frameData.length >= 2)
    .map(
      (frameData) =>
        new LifeBarFrame(
          parseNumber(frameData[0], parseInt),
          parseNumber(frameData[1], parseFloat),
        ),
    );
}

// Decodes an .osr like osu-parsers' ScoreDecoder, but decompresses the replay
// with lzma1, which is about 15x faster than osu-parsers' LZMA library.
export async function decodeScore(buffer: Uint8Array | ArrayBuffer): Promise<Score> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const score = await scoreDecoder.decodeFromBuffer(bytes, false);
  const header = readReplayHeader(bytes);
  if (header.compressedReplay.length === 0) return score;

  const replay = new Replay();
  replay.mode = score.info.rulesetId;
  replay.gameVersion = header.gameVersion;
  replay.hashMD5 = header.replayHashMD5;
  replay.frames = decodeLegacyReplayFrames(textDecoder.decode(decompress(header.compressedReplay)));
  replay.lifeBar = decodeLifeBar(header.lifeData);
  score.replay = replay;
  return score;
}

/**
 * Replay frames as the standard ruleset sees them, one typed array per field: the
 * same frames, times and positions as decodeScore followed by
 * StandardRuleset.applyToReplay, without an object per frame. `actions` holds
 * StandardAction bits (1 << action).
 */
export type ReplayFrames = {
  length: number;
  time: Float64Array;
  x: Float64Array;
  y: Float64Array;
  actions: Uint8Array;
};

// ReplayButtonState bits, and the StandardAction bits StandardReplayFrame.fromLegacy maps them to.
const BUTTONS_LEFT = 1 | 4;
const BUTTONS_RIGHT = 2 | 8;
const BUTTONS_SMOKE = 16;
const ACTION_LEFT = 1 << 0;
const ACTION_RIGHT = 1 << 1;
const ACTION_SMOKE = 1 << 2;

function grow<T extends Float64Array | Uint8Array>(array: T, capacity: number): T {
  const grown = new (array.constructor as new (length: number) => T)(capacity);
  grown.set(array);
  return grown;
}

// Follows decodeLegacyReplayFrames, scanning the text instead of splitting it.
export function parseReplayFrames(data: string): ReplayFrames {
  let capacity = 1024;
  let time = new Float64Array(capacity);
  let x = new Float64Array(capacity);
  let y = new Float64Array(capacity);
  let actions = new Uint8Array(capacity);
  let length = 0;
  let lastTime = 0;

  for (let i = 0, start = 0; start <= data.length; i++) {
    let end = data.indexOf(",", start);
    if (end === -1) end = data.length;
    const frameStart = start;
    start = end + 1;
    if (end === frameStart) continue;

    const p1 = data.indexOf("|", frameStart);
    const p2 = p1 === -1 || p1 >= end ? -1 : data.indexOf("|", p1 + 1);
    const p3 = p2 === -1 || p2 >= end ? -1 : data.indexOf("|", p2 + 1);
    if (p3 === -1 || p3 >= end) continue;
    let p4 = data.indexOf("|", p3 + 1);
    if (p4 === -1 || p4 > end) p4 = end;
    const first = data.slice(frameStart, p1);
    if (first === "-12345") continue;

    const interval = parseNumber(first, parseFloat);
    const mouseX = parseNumber(data.slice(p1 + 1, p2), parseFloat);
    const mouseY = parseNumber(data.slice(p2 + 1, p3), parseFloat);
    const buttons = parseNumber(data.slice(p3 + 1, p4), parseInt);
    lastTime += interval;

    if (i < 2 && mouseX === 256 && mouseY === -500) continue;
    if (interval < 0) continue;

    if (length === capacity) {
      capacity *= 2;
      time = grow(time, capacity);
      x = grow(x, capacity);
      y = grow(y, capacity);
      actions = grow(actions, capacity);
    }
    time[length] = lastTime;
    x[length] = mouseX;
    y[length] = mouseY;
    actions[length] =
      (buttons & BUTTONS_LEFT ? ACTION_LEFT : 0) |
      (buttons & BUTTONS_RIGHT ? ACTION_RIGHT : 0) |
      (buttons & BUTTONS_SMOKE ? ACTION_SMOKE : 0);
    length++;
  }

  return {
    length,
    time: time.slice(0, length),
    x: x.slice(0, length),
    y: y.slice(0, length),
    actions: actions.slice(0, length),
  };
}

/** Decodes the replay frames of an .osr, skipping the score info. */
export function decodeReplayFrames(buffer: Uint8Array | ArrayBuffer): ReplayFrames {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const header = readReplayHeader(bytes);
  if (header.compressedReplay.length === 0) throw new Error("This score has no replay");
  return parseReplayFrames(textDecoder.decode(decompress(header.compressedReplay)));
}

// Stored replay frames: a 16-byte header ("OOFR", format version, frame count,
// unused), then the time, x and y columns as little-endian float64s and the
// actions column as bytes. The header keeps the float64 columns 8-byte aligned.
const FRAMES_MAGIC = 0x52464f4f; // "OOFR"
const FRAMES_VERSION = 1;
const FRAMES_HEADER_BYTES = 16;

/** Encodes replay frames in the format the browser reads with readReplayFrames. */
export function encodeReplayFrames(frames: ReplayFrames): Uint8Array {
  const n = frames.length;
  const bytes = new Uint8Array(FRAMES_HEADER_BYTES + n * 3 * 8 + n);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, FRAMES_MAGIC, true);
  view.setUint32(4, FRAMES_VERSION, true);
  view.setUint32(8, n, true);
  let offset = FRAMES_HEADER_BYTES;
  for (const column of [frames.time, frames.x, frames.y]) {
    for (let i = 0; i < n; i++) view.setFloat64(offset + i * 8, column[i], true);
    offset += n * 8;
  }
  bytes.set(frames.actions.subarray(0, n), offset);
  return bytes;
}

/** Reads replay frames written by encodeReplayFrames. */
export function readReplayFrames(buffer: Uint8Array | ArrayBuffer): ReplayFrames {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < FRAMES_HEADER_BYTES || view.getUint32(0, true) !== FRAMES_MAGIC) {
    throw new Error("Not a replay frames file");
  }
  if (view.getUint32(4, true) !== FRAMES_VERSION)
    throw new Error("Unsupported replay frames version");
  const n = view.getUint32(8, true);
  if (bytes.byteLength !== FRAMES_HEADER_BYTES + n * 25) throw new Error("Truncated replay frames");

  const column = (index: number) => {
    const values = new Float64Array(n);
    const offset = FRAMES_HEADER_BYTES + index * n * 8;
    for (let i = 0; i < n; i++) values[i] = view.getFloat64(offset + i * 8, true);
    return values;
  };
  return {
    length: n,
    time: column(0),
    x: column(1),
    y: column(2),
    actions: bytes.slice(FRAMES_HEADER_BYTES + n * 24, FRAMES_HEADER_BYTES + n * 25),
  };
}
