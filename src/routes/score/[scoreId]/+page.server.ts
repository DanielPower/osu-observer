import type { PageServerLoad } from './$types';
import { getBeatmapFromHash, getScore } from '$lib/server/osu_api';
import { captureEvent } from '$lib/server/analytics';

export const prerender = false;

export const load: PageServerLoad = async ({ params }) => {
	const { scoreId } = params;

	const score = await getScore(scoreId);
	const deferredData = getBeatmapFromHash(score.info.beatmapHashMD5).then((beatmap) => ({
		beatmapId: beatmap.id,
		beatmapSetId: beatmap.beatmapset_id,
		title: beatmap.beatmapset.title,
		artist: beatmap.beatmapset.artist,
		creator: beatmap.beatmapset.creator,
		version: beatmap.version
	}));
	captureEvent('view_score', {
		scoreId,
		username: score.info.username,
		beatmapId: score.info.beatmapId
	});

	return {
		scoreId,
		username: score.info.username,
		beatmapId: score.info.beatmapId,
		deferredData
	};
};
