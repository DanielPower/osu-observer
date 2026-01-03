import { env } from '$env/dynamic/private';
import { captureEvent } from '$lib/server/analytics';
import { auth } from 'osu-api-extended';
import type { Handle } from '@sveltejs/kit';

if (!env.SAVE_MEDIA_PATH) {
	throw new Error('SAVE_MEDIA_PATH is not set in environment variables');
}

await auth.login({
	type: 'lazer',
	login: env.OSU_USERNAME,
	password: env.OSU_PASSWORD,
	cachedTokenPath: './client.json'
});

export const handle: Handle = async ({ event, resolve }) => {
	captureEvent('pageview', {
		path: event.url.pathname
	});
	return await resolve(event);
};
