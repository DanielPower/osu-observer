import { BlobWriter } from '@zip.js/zip.js';
import { BeatmapDecoder, ScoreDecoder } from 'osu-parsers';

const beatmapDecoder = new BeatmapDecoder();
const scoreDecoder = new ScoreDecoder();

export const extractAudioFile = async (entry: any) => {
	if (!entry.getData) {
		throw new Error('Entry does not have a getData method');
	}

	const blobWriter = new BlobWriter();
	await entry.getData(blobWriter);
	const blob = await blobWriter.getData();

	// Create an object URL for the audio blob
	const audioUrl = URL.createObjectURL(blob);
	return audioUrl;
};

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
