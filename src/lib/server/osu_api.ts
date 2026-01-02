import { auth, v2 } from 'osu-api-extended';
import { BeatmapDecoder, ScoreDecoder } from 'osu-parsers';
import { existsSync } from 'fs';
import extract from 'extract-zip';
import { env } from '$env/dynamic/private';
import { resolve } from 'path';
import { readdir, rename } from 'fs/promises';

if (!env.SAVE_MEDIA_PATH) {
	throw new Error('SAVE_MEDIA_PATH is not set in environment variables');
}

const mediaPath = resolve(process.cwd(), env.SAVE_MEDIA_PATH);

let authorized = false;
const login = async () => {
	if (authorized) {
		return;
	}
	await auth.login({
		type: 'lazer',
		login: env.OSU_USERNAME,
		password: env.OSU_PASSWORD,
		cachedTokenPath: './client.json'
	});
	authorized = true;
};

const scoreDecoder = new ScoreDecoder();
const beatmapDecoder = new BeatmapDecoder();

export const getScore = async (scoreId: string) => {
	await login();
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
	await login();
	if (existsSync(`${mediaPath}/beatmaps/${beatmapSetId}`)) {
		console.log('Beatmap Set already downloaded', beatmapSetId);
	} else {
		console.log('Downloading Beatmap Set', beatmapSetId);
		const result = await v2.beatmaps.download({
			type: 'set',
			id: beatmapSetId,
			host: 'osu_direct_mirror',
			file_path: `${mediaPath}/beatmaps/${beatmapSetId}.osz`
		});
		if (result.error) {
			throw result.error;
		}
		await extract(`${mediaPath}/beatmaps/${beatmapSetId}.osz`, {
			dir: `${mediaPath}/beatmaps/${beatmapSetId}`
		});
		for (const file of await readdir(`${mediaPath}/beatmaps/${beatmapSetId}`)) {
			if (file.endsWith('.osu')) {
				const filePath = `${mediaPath}/beatmaps/${beatmapSetId}/${file}`;
				const beatmap = await beatmapDecoder.decodeFromPath(filePath);
				await rename(
					filePath,
					`${mediaPath}/beatmaps/${beatmapSetId}/${beatmap.metadata.beatmapId}.osu`
				);
			}
		}
		console.log('Beatmap downloaded', beatmapSetId);
	}
};

export const getBeatmapFromHash = async (hash: string) => {
	await login();
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
