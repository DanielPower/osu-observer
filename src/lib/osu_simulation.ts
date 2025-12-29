import type { Beatmap, Replay } from 'osu-classes';
import { StandardAction, type StandardReplayFrame } from 'osu-standard-stable';
import { calcObjectRadius, calcPreempt } from './osu_math';

type HitObject = {
	x: number;
	y: number;
	time: number;
	hitColorIndex: number;
	hitCircleNumber: number;
};

export type SimulatedFrame = {
	x: number;
	y: number;
	time: number;
	score: number;
	combo: number;
	perfect: number;
	good: number;
	okay: number;
	miss: number;
	actions: Set<StandardAction>;
	hitObjects: HitObject[];
};

export const isInside = (cx: number, cy: number, hx: number, hy: number, hr: number) =>
	Math.sqrt((cx - hx) ** 2 + (cy - hy) ** 2) < hr;

const buttons = (rawInput: number) => ({
	left: !!((rawInput >> 1) & 1 || (rawInput >> 3) & 1),
	right: !!((rawInput >> 2) & 1 || (rawInput >> 4) & 1),
	smoke: !!((rawInput >> 5) & 1)
});

export const simulateReplay = (
	replay: Replay,
	beatmap: Beatmap,
	mods: number
): SimulatedFrame[] => {
	const simulatedFrames: SimulatedFrame[] = [];
	const frames = replay.frames as StandardReplayFrame[];
	const radius = calcObjectRadius(beatmap.difficulty.circleSize);

	let hitObjectIndex = 0;
	let score = 0;
	let combo = 0;
	let hitColorIndex = 0;
	let hitCircleNumber = 0;
	let perfect = 0;
	let good = 0;
	let okay = 0;
	let miss = 0;
	let hitObjects: HitObject[] = [];

	for (let i = 0; i < replay.frames.length - 1; i++) {
		const frame = frames[i];
		const { left, right } = buttons(frame.buttonState);
		const { x, y } = frame.position;
		const preempt = calcPreempt(beatmap.difficulty.approachRate);
		hitObjects = hitObjects.filter((hitObject) => hitObject.time > frame.startTime);
		while (
			beatmap.hitObjects[hitObjectIndex] &&
			frame.startTime > beatmap.hitObjects[hitObjectIndex].startTime - preempt
		) {
			const hitObject = beatmap.hitObjects[hitObjectIndex];
			hitCircleNumber += 1;
			if (!!((hitObject.hitType >> 2) & 1)) {
				hitColorIndex = (hitColorIndex + 1) % beatmap.colors.comboColors.length;
				hitCircleNumber = 1;
			}

			console.log(frame);
			if (left || right) {
				score += 100;
			}

			hitObjects.push({
				x: hitObject.startX,
				y: hitObject.startY,
				time: hitObject.startTime,
				hitColorIndex,
				hitCircleNumber
			});
			hitObjectIndex++;
		}
		simulatedFrames.push({
			x,
			y,
			time: frame.startTime,
			score,
			combo,
			perfect,
			good,
			okay,
			miss,
			actions: frame.actions,
			hitObjects: [...hitObjects]
		});
	}

	return simulatedFrames;
};
