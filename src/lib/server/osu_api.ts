import { BeatmapDecoder, ScoreDecoder } from 'osu-parsers';
import { existsSync } from 'fs';
import extract from 'extract-zip';
import { env } from '$env/dynamic/private';
import { readdir, rename } from 'fs/promises';
import { v2 } from 'osu-api-extended';

const scoreDecoder = new ScoreDecoder();
const beatmapDecoder = new BeatmapDecoder();

export const getScore = async (scoreId: string) => {
	if (!existsSync(`${env.SAVE_MEDIA_PATH}/scores/${scoreId}.osr`)) {
		console.log('Downloading Score', scoreId);
		const result = await v2.scores.download({
			id: parseInt(scoreId, 10),
			file_path: `${env.SAVE_MEDIA_PATH}/scores/${scoreId}.osr`
		});
		if (result.error) {
			throw result.error;
		}
		console.log('Score downloaded', scoreId);
	} else {
		console.log('Score already downloaded', scoreId);
	}
	const score = await scoreDecoder.decodeFromPath(`${env.SAVE_MEDIA_PATH}/scores/${scoreId}.osr`);
	return score;
};

export const downloadBeatmapSet = async (beatmapSetId: number) => {
	if (existsSync(`${env.SAVE_MEDIA_PATH}/beatmaps/${beatmapSetId}`)) {
		console.log('Beatmap Set already downloaded', beatmapSetId);
	} else {
		console.log('Downloading Beatmap Set', beatmapSetId);
		const result = await v2.beatmaps.download({
			type: 'set',
			id: beatmapSetId,
			host: 'osu_direct_mirror',
			file_path: `${env.SAVE_MEDIA_PATH}/beatmaps/${beatmapSetId}.osz`
		});
		if (result.error) {
			throw result.error;
		}
		await extract(`${env.SAVE_MEDIA_PATH}/beatmaps/${beatmapSetId}.osz`, {
			dir: `${env.SAVE_MEDIA_PATH}/beatmaps/${beatmapSetId}`
		});
		for (const file of await readdir(`${env.SAVE_MEDIA_PATH}/beatmaps/${beatmapSetId}`)) {
			if (file.endsWith('.osu')) {
				const filePath = `${env.SAVE_MEDIA_PATH}/beatmaps/${beatmapSetId}/${file}`;
				const beatmap = await beatmapDecoder.decodeFromPath(filePath);
				await rename(
					filePath,
					`${env.SAVE_MEDIA_PATH}/beatmaps/${beatmapSetId}/${beatmap.metadata.beatmapId}.osu`
				);
			}
		}
		console.log('Beatmap downloaded', beatmapSetId);
	}
};

export const getBeatmapFromHash = async (hash: string) => {
	const result = await v2.beatmaps.lookup({
		type: 'difficulty',
		checksum: hash
	});
	if (result.error) {
		throw result.error;
	}

	await downloadBeatmapSet(result.beatmapset_id);
	return result;
};
