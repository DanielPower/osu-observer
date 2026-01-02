import { BeatmapDecoder, ScoreDecoder } from 'osu-parsers';

const beatmapDecoder = new BeatmapDecoder();
const scoreDecoder = new ScoreDecoder();

export const readBeatmap = async (url: string) => {
	const response = await fetch(url);
	const buffer = await response.arrayBuffer();
	return beatmapDecoder.decodeFromBuffer(buffer);
};

export const readScore = async (url: string) => {
	const response = await fetch(url);
	const buffer = await response.arrayBuffer();
	const score = await scoreDecoder.decodeFromBuffer(buffer, true);

	return score;
};

export const readAudio = async (url: string) => {
	const response = await fetch(url);
	const blob = await response.blob();
	const audioUrl = URL.createObjectURL(blob);
	const audio = new Audio(audioUrl);
	return audio;
};
