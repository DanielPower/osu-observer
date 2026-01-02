import { env } from '$env/dynamic/private';
import { auth } from 'osu-api-extended';

if (!env.SAVE_MEDIA_PATH) {
	throw new Error('SAVE_MEDIA_PATH is not set in environment variables');
}

await auth.login({
	type: 'lazer',
	login: env.OSU_USERNAME,
	password: env.OSU_PASSWORD,
	cachedTokenPath: './client.json'
});
