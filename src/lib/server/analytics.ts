import { env } from '$env/dynamic/private';
import { PostHog } from 'posthog-node';

export let postHog: PostHog | null = null;

if (env.POSTHOG_API_KEY && env.POSTHOG_HOST) {
	console.log('Initializing PostHog analytics');
	postHog = new PostHog(env.POSTHOG_API_KEY, {
		host: env.POSTHOG_HOST
	});
}

export const captureEvent = (eventName: string, properties: Record<string, any>) => {
	console.log(`Capturing event: ${eventName}`, properties);
	if (postHog) {
		postHog.capture({
			event: eventName,
			properties: properties
		});
	}
};
