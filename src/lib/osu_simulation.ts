import { HitResult, HitType, type Beatmap, type Replay } from 'osu-classes';
import { StandardAction, StandardBeatmap, type StandardReplayFrame } from 'osu-standard-stable';
import { calcObjectRadius } from './osu_math';

export type HitObject = {
	x: number;
	y: number;
	time: number;
	resultTime: number;
	result: HitResult;
	type: HitType;
	hitColorIndex: number;
	hitCircleNumber: number;
};

export type SimulatedFrame = {
	x: number;
	y: number;
	time: number;
	score: number;
	combo: number;
	great: number;
	good: number;
	okay: number;
	miss: number;
	accuracy: number;
	actions: Set<StandardAction>;
};

export type Simulation = {
	hitObjects: HitObject[];
	frames: SimulatedFrame[];
};

export const isInside = (cx: number, cy: number, hx: number, hy: number, hr: number) =>
	Math.sqrt((cx - hx) ** 2 + (cy - hy) ** 2) < hr;

export const simulateReplay = (
	replay: Replay,
	beatmap: StandardBeatmap,
	mods: number
): Simulation => {
	console.log(beatmap);
	const simulatedFrames: SimulatedFrame[] = [];
	const frames = replay.frames as StandardReplayFrame[];
	const radius = calcObjectRadius(beatmap.difficulty.circleSize);
	const hitObjects: HitObject[] = [];

	let hitObjectIndex = 0;
	let hitColorIndex = 0;
	let hitCircleNumber = 1;
	let score = 0;
	let combo = 0;
	let great = 0;
	let good = 0;
	let okay = 0;
	let miss = 0;

	for (let i = 1; i < replay.frames.length - 1; i++) {
		if (hitObjectIndex >= beatmap.hitObjects.length) {
			break;
		}
		const frame = frames[i];
		const prevFrame = frames[i - 1];
		const left = frame.actions.has(StandardAction.LeftButton);
		const prevLeft = prevFrame.actions.has(StandardAction.LeftButton);
		const right = frame.actions.has(StandardAction.RightButton);
		const prevRight = prevFrame.actions.has(StandardAction.RightButton);
		const clicked = (!prevLeft && left) || (!prevRight && right);
		const { x, y } = frame.position;

		const hitObject = beatmap.hitObjects[hitObjectIndex];
		if ((hitObject.hitType >> 1) & 1) {
			// TODO support sliders
			score += 300;
			great += 1;
			combo += 1;
			hitObjectIndex += 1;
			hitObjects.push({
				x: hitObject.startX,
				y: hitObject.startY,
				time: hitObject.startTime,
				resultTime: frame.startTime,
				hitColorIndex,
				hitCircleNumber,
				result: HitResult.Great,
				type: hitObject.hitType
			});
			continue;
		}
		if (!hitObject.hitWindows.canBeHit(frame.startTime - hitObject.startTime)) {
			hitObjectIndex += 1;
			combo = 0;
			miss += 1;
			hitObjects.push({
				x: hitObject.startX,
				y: hitObject.startY,
				time: hitObject.startTime,
				resultTime: frame.startTime,
				hitColorIndex,
				hitCircleNumber,
				result: HitResult.Miss,
				type: hitObject.hitType
			});
			continue;
		}
		if ((hitObject.hitType >> 3) & 1) {
			// TODO support spinners
			score += 300;
			great += 1;
			combo += 1;
			hitObjectIndex += 1;
		}

		if (hitObject && clicked && isInside(x, y, hitObject.startX, hitObject.startY, radius)) {
			const result = hitObject.hitWindows.resultFor(hitObject.startTime - frame.startTime);

			// TODO these are probably wrong, and certainly don't account for ScoreV2
			// Scoring probably needs to be modular (standard, scorev2, lazer)
			if (result !== HitResult.None) {
				combo += 1;
				if (result === HitResult.Meh) {
					score += 50;
					okay += 1;
				} else if (result === HitResult.Ok) {
					score += 100;
					good += 1;
				} else if (result === HitResult.Great) {
					score += 300;
					great += 1;
				} else if (result === HitResult.Miss) {
					miss += 1;
					combo = 0;
				} else {
					throw new Error('unsupported result: ' + result);
				}
				hitObjectIndex += 1;
				hitObjects.push({
					x: hitObject.startX,
					y: hitObject.startY,
					time: hitObject.startTime,
					resultTime: frame.startTime,
					hitColorIndex,
					hitCircleNumber,
					result,
					type: hitObject.hitType
				});
			}
		}

		simulatedFrames.push({
			x,
			y,
			time: frame.startTime,
			score,
			combo,
			great,
			good,
			okay,
			miss,
			accuracy: score / (hitObjectIndex * 300),
			actions: frame.actions
		});
	}

	return {
		hitObjects,
		frames: simulatedFrames
	};
};
