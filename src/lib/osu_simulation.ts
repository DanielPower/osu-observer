import { HitResult, type HitType, type Replay } from 'osu-classes';
import { StandardAction, StandardBeatmap, type StandardReplayFrame } from 'osu-standard-stable';
import { calcObjectRadius } from './osu_math';

export type HitCricle = {
	x: number;
	y: number;
	time: number;
	resultTime: number;
	result: HitResult;
};

export type HitObject = {
	x: number;
	y: number;
	time: number;
	resultTime: number;
	result: HitResult;
	type: HitType;
	endTime?: number; // For spinners
	totalRotation?: number; // For spinners - total rotation achieved in radians
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
	angle?: number; // Cursor angle for spinner calculation
	currentSpinnerRotation?: number; // Current rotation during active spinner
};

export type Simulation = {
	hitObjects: HitObject[];
	frames: SimulatedFrame[];
};

export const isInside = (cx: number, cy: number, hx: number, hy: number, hr: number) =>
	Math.sqrt((cx - hx) ** 2 + (cy - hy) ** 2) < hr;

// Calculate angle from center of screen to cursor position
const getCursorAngle = (x: number, y: number): number => {
	const centerX = 256;
	const centerY = 192;
	return Math.atan2(y - centerY, x - centerX);
};

// Calculate angular difference, handling wrap-around
const getAngularDifference = (angle1: number, angle2: number): number => {
	let diff = angle2 - angle1;
	// Normalize to [-PI, PI]
	while (diff > Math.PI) diff -= 2 * Math.PI;
	while (diff < -Math.PI) diff += 2 * Math.PI;
	return diff;
};

// Calculate required spins based on OD (Overall Difficulty)
// Based on osu! source: required RPM is interpolated between OD values
const getSpinsRequired = (duration: number, od: number): number => {
	// RPM required to complete spinner at ODs [0, 5, 10]
	const COMPLETE_RPM_MIN = 250;
	const COMPLETE_RPM_MID = 380;
	const COMPLETE_RPM_MAX = 430;

	let requiredRPM: number;
	if (od <= 5) {
		requiredRPM = COMPLETE_RPM_MIN + (COMPLETE_RPM_MID - COMPLETE_RPM_MIN) * (od / 5);
	} else {
		requiredRPM = COMPLETE_RPM_MID + (COMPLETE_RPM_MAX - COMPLETE_RPM_MID) * ((od - 5) / 5);
	}

	// Convert RPM to total rotations for this spinner duration
	const durationMinutes = duration / 60000;
	return requiredRPM * durationMinutes;
};

export const simulateScore = (replay: Replay, beatmap: StandardBeatmap): Simulation => {
	const simulatedFrames: SimulatedFrame[] = [];
	const frames = replay.frames as StandardReplayFrame[];
	const radius = calcObjectRadius(beatmap.difficulty.circleSize);
	const hitObjects: HitObject[] = [];

	let hitObjectIndex = 0;
	let baseScore = 0;
	let combo = 0;
	let great = 0;
	let good = 0;
	let okay = 0;
	let miss = 0;

	// Track spinner state
	let activeSpinner: {
		hitObject: any;
		totalRotation: number;
		lastAngle: number;
		isSpinning: boolean;
	} | null = null;

	for (let i = 1; i < replay.frames.length - 1; i++) {
		const frame = frames[i];
		const prevFrame = frames[i - 1];
		const left = frame.actions.has(StandardAction.LeftButton);
		const prevLeft = prevFrame.actions.has(StandardAction.LeftButton);
		const right = frame.actions.has(StandardAction.RightButton);
		const prevRight = prevFrame.actions.has(StandardAction.RightButton);
		const clicked = (!prevLeft && left) || (!prevRight && right);
		const { x, y } = frame.position;

		const currentAngle = getCursorAngle(x, y);

		// Check if we have an active spinner
		if (activeSpinner) {
			const isHolding = left || right;
			if (isHolding) {
				// Calculate rotation since last frame
				const angleDiff = getAngularDifference(activeSpinner.lastAngle, currentAngle);
				activeSpinner.totalRotation += Math.abs(angleDiff);
				activeSpinner.lastAngle = currentAngle;
				activeSpinner.isSpinning = true;
			}

			// Check if spinner is complete
			if (frame.startTime >= activeSpinner.hitObject.endTime) {
				// Spinner finished - determine result based on rotation
				const duration = activeSpinner.hitObject.endTime - activeSpinner.hitObject.startTime;
				const spinsRequired = getSpinsRequired(duration, beatmap.difficulty.overallDifficulty);
				const completedSpins = activeSpinner.totalRotation / (2 * Math.PI);
				const completionRatio = completedSpins / spinsRequired;

				let result: HitResult;
				if (completionRatio >= 1.0) {
					result = HitResult.Great;
					baseScore += 300;
					great += 1;
					combo += 1;
				} else if (completionRatio > 0.9) {
					result = HitResult.Ok;
					baseScore += 100;
					good += 1;
					combo += 1;
				} else if (completionRatio > 0.75) {
					result = HitResult.Meh;
					baseScore += 50;
					okay += 1;
					combo += 1;
				} else {
					result = HitResult.Miss;
					miss += 1;
					combo = 0;
				}

				hitObjects.push({
					x: 256, // Spinner is always centered
					y: 192,
					time: activeSpinner.hitObject.startTime,
					resultTime: frame.startTime,
					endTime: activeSpinner.hitObject.endTime,
					totalRotation: activeSpinner.totalRotation,
					result,
					type: activeSpinner.hitObject.hitType
				});

				activeSpinner = null;
				hitObjectIndex += 1;
			}
		}

		const hitObject = beatmap.hitObjects[hitObjectIndex];
		if (hitObject && !activeSpinner) {
			let result: HitResult = HitResult.None;
			if ((hitObject.hitType >> 1) & 1 && frame.startTime >= hitObject.startTime) {
				// TODO support sliders
				result = HitResult.Great;
			} else if ((hitObject.hitType >> 3) & 1 && frame.startTime >= hitObject.startTime) {
				// Spinner - initialize active spinner tracking
				activeSpinner = {
					hitObject,
					totalRotation: 0,
					lastAngle: currentAngle,
					isSpinning: false
				};
			} else if (!hitObject.hitWindows.canBeHit(frame.startTime - hitObject.startTime)) {
				result = HitResult.Miss;
			} else if (
				hitObject &&
				clicked &&
				isInside(x, y, hitObject.startX, hitObject.startY, radius)
			) {
				result = hitObject.hitWindows.resultFor(hitObject.startTime - frame.startTime);
			}
			if (result !== HitResult.None) {
				combo += 1;
				if (result === HitResult.Meh) {
					baseScore += 50;
					okay += 1;
				} else if (result === HitResult.Ok) {
					baseScore += 100;
					good += 1;
				} else if (result === HitResult.Great) {
					baseScore += 300;
					great += 1;
				} else if (result === HitResult.Miss) {
					miss += 1;
					combo = 0;
				} else {
					// throw new Error('unsupported result: ' + result);
					console.log('Unsupported result: ' + result);
				}
				hitObjectIndex += 1;
				hitObjects.push({
					x: hitObject.startX,
					y: hitObject.startY,
					time: hitObject.startTime,
					resultTime: (hitObject.hitType >> 1) & 1 ? hitObject.startTime : frame.startTime,
					result,
					type: hitObject.hitType
				});
			}
		}
		simulatedFrames.push({
			x,
			y,
			time: frame.startTime,
			score: baseScore,
			combo,
			great,
			good,
			okay,
			miss,
			accuracy: baseScore / (hitObjectIndex * 300) || 1,
			actions: frame.actions,
			angle: currentAngle,
			currentSpinnerRotation: activeSpinner ? activeSpinner.totalRotation : undefined
		});
	}

	return {
		hitObjects,
		frames: simulatedFrames
	};
};
