import { env } from '$env/dynamic/private';
import { auth } from 'osu-api-extended';

await auth.login({
	type: 'lazer',
	login: env.OSU_USERNAME,
	password: env.OSU_PASSWORD,
	cachedTokenPath: './client.json'
});

