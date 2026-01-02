import { env } from '$env/dynamic/private';
import { osuApiExtended } from '$lib/server/osu_api';

if (!env.SAVE_MEDIA_PATH) {
	throw new Error('SAVE_MEDIA_PATH is not set in environment variables');
}

await osuApiExtended.auth.login({
	type: 'lazer',
	login: env.OSU_USERNAME,
	password: env.OSU_PASSWORD,
	cachedTokenPath: './client.json'
});
