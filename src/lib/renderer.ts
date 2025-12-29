import { HitObject, Score, type Beatmap } from 'osu-classes';
import { Application, Graphics } from 'pixi.js';
import { calcPreempt, calcFade, calcObjectRadius } from './osu_math';
import { type StandardReplayFrame } from 'osu-standard-stable';

function approachCircleRadius({
	timeRemaining,
	preempt,
	objectRadius
}: {
	timeRemaining: number;
	preempt: number;
	objectRadius: number;
}) {
	const progress = Math.min(Math.max(1 - timeRemaining / preempt, 0), 1); // Clamped between 0 and 1
	const approachRadius = (3 - 2 * progress) * objectRadius;

	return approachRadius;
}

const hr = (mods: number) => !!((mods >> 4) & 1);

export const createRenderData = async ({ beatmap, score }: { beatmap: Beatmap; score: Score }) => {
	const output = [];
	if (!score.replay) {
		throw new Error('No replay found');
	}
	console.log(score.replay);
	for (const frame of score.replay.frames as StandardReplayFrame[]) {
		output.push({
			position: {
				x: frame.position.x,
				y: frame.position.y
			}
		});
	}
	return output;
};

export const createRenderer = async ({ beatmap, score }: { beatmap: Beatmap; score?: Score }) => {
	const renderer = new Application();
	const offsetX = (640 - 512) / 2;
	const offsetY = (480 - 384) / 2;

	await renderer.init({ backgroundColor: 0x000000, width: 640, height: 480, antialias: true });

	const preempt = calcPreempt(beatmap.difficulty.approachRate);
	const fade = calcFade(beatmap.difficulty.approachRate);
	const objectRadius = calcObjectRadius(beatmap.difficulty.circleSize);
	const cursor = new Graphics();
	renderer.stage.addChild(cursor);

	const circles: {
		hitObject: HitObject;
		hitCircle: Graphics;
		approachCircle: Graphics;
	}[] = [];

	let hitColorIndex = 0;
	for (const hitObject of beatmap.hitObjects) {
		const hitCircle = new Graphics();
		if (hitObject.hitType === 2) {
			hitColorIndex = (hitColorIndex + 1) % beatmap.colors.comboColors.length;
		}
		const color = beatmap.colors.comboColors[hitColorIndex];
		const hexColor = (color.red << 16) + (color.green << 8) + color.blue;
		hitCircle.circle(hitObject.startX + offsetX, hitObject.startY + offsetY, objectRadius);
		hitCircle.fill(hexColor);
		hitCircle.stroke(0x000000);
		hitCircle.zIndex = -hitObject.startTime;
		hitCircle.alpha = 0;
		hitCircle.visible = false;
		renderer.stage.addChild(hitCircle);

		const approachCircle = new Graphics();
		approachCircle.visible = false;
		approachCircle.zIndex = -hitObject.startTime;
		renderer.stage.addChild(approachCircle);

		circles.push({ hitObject, hitCircle, approachCircle });
	}

	const update = (time: number) => {
		for (const { hitObject, hitCircle, approachCircle } of circles) {
			if (time >= hitObject.startTime - preempt && time <= hitObject.startTime) {
				const alpha = Math.min(1, (time - (hitObject.startTime - preempt)) / fade);
				hitCircle.visible = true;
				approachCircle.visible = true;
				approachCircle.clear();
				approachCircle.circle(
					hitObject.startX + offsetX,
					hitObject.startY + offsetY,
					approachCircleRadius({
						timeRemaining: hitObject.startTime - time,
						preempt,
						objectRadius
					})
				);
				approachCircle.stroke(0xffffff);
				hitCircle.alpha = alpha;
				approachCircle.alpha = alpha;
			} else {
				hitCircle.visible = false;
				approachCircle.visible = false;
			}
		}

		if (score?.replay) {
			const frameIndex = score.replay.frames.findIndex((frame) => frame.startTime > time) - 1;
			const frame = score.replay.frames[Math.max(0, frameIndex)];

			const y = hr(score.info.rawMods) ? 384 - frame.position.y : frame.position.y;
			cursor.moveTo(frame.position.x + offsetX, y + offsetY);
			cursor.clear();
			cursor.circle(frame.position.x + offsetX, y + offsetY, 5);
			cursor.fill(0xff0000);
		}
	};

	return {
		update,
		canvas: renderer.canvas
	};
};
