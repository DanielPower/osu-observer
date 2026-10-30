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
function decodeReplayFrames(data: string): LegacyReplayFrame[] {
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
  replay.frames = decodeReplayFrames(textDecoder.decode(decompress(header.compressedReplay)));
  replay.lifeBar = decodeLifeBar(header.lifeData);
  score.replay = replay;
  return score;
}
