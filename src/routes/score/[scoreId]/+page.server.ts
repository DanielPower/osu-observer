import type { PageServerLoad } from './$types';
import { getBeatmapFromHash, getScore } from '$lib/server/osu_api';
import type { beatmaps_lookup_difficulty_response } from 'osu-api-extended/dist/types/v2/beatmaps_lookup_difficulty';

const getUrls = (scoreId: string, beatmap: beatmaps_lookup_difficulty_response) => {
	const folder = `/beatmaps/${beatmap.beatmapset_id}`;
	return {
		beatmapUrl: `${folder}/${beatmap.id}.osu`,
		scoreUrl: `/scores/${scoreId}.osr`
	};
};

export const load: PageServerLoad = async ({ params }) => {
	const { scoreId } = params;

	const score = await getScore(scoreId);
	const deferredData = getBeatmapFromHash(score.info.beatmapHashMD5).then((beatmap) => ({
		...getUrls(scoreId, beatmap),
		beatmapSetId: beatmap.beatmapset_id,
		title: beatmap.beatmapset.title,
		artist: beatmap.beatmapset.artist,
		creator: beatmap.beatmapset.creator,
		version: beatmap.version
	}));

	return {
		scoreId,
		username: score.info.username,
		beatmapId: score.info.beatmapId,
		deferredData
	};
};
