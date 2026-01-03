import { test, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { BeatmapDecoder, ScoreDecoder } from 'osu-parsers';
import { simulateScore } from '../src/lib/osu_simulation.ts';

function getFileMd5Sync(filePath: string) {
	const data = readFileSync(filePath); // read entire file into memory
	return createHash('md5').update(data).digest('hex');
}

const scoreDecoder = new ScoreDecoder();
const beatmapDecoder = new BeatmapDecoder();

const replayFiles = readdirSync('./test/data/replays').filter((filePath) =>
	filePath.endsWith('.osr')
);
const beatmapFiles = new Map(
	readdirSync('./test/data/beatmaps')
		.filter((filePath) => filePath.endsWith('.osu'))
		.map((filePath) => [getFileMd5Sync(`./test/data/beatmaps/${filePath}`), filePath])
);

test.each(replayFiles)('Simulates %s', async (replayFile) => {
	const score = await scoreDecoder.decodeFromPath(`./test/data/replays/${replayFile}`);
	const beatmapFile = beatmapFiles.get(score.info.beatmapHashMD5);
	const beatmap = await beatmapDecoder.decodeFromPath(`./test/data/beatmaps/${beatmapFile}`);

	const simulation = simulateScore(score, beatmap, 0);
	const lastFrame = simulation.frames[simulation.frames.length - 1];

	expect(lastFrame.great).toEqual(score.info.count300);
	expect(lastFrame.good).toEqual(score.info.count100);
	expect(lastFrame.okay).toEqual(score.info.count50);
	expect(lastFrame.miss).toEqual(score.info.countMiss);
});
