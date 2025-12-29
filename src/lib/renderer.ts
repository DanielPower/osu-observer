import { HitObject, Score, type Beatmap } from 'osu-classes';
import { Application, Graphics, Text } from 'pixi.js';
import { calcPreempt, calcObjectRadius, calcAlpha } from './osu_math';
import type { SimulatedFrame } from './osu_simulation';

const BASE_WIDTH = 512;
const BASE_HEIGHT = 384;

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

export type Renderer = {
	update: (time: number) => void;
	canvas: HTMLCanvasElement;
};

export const createRenderer = async ({
	beatmap,
	score,
	simulation,
	width,
	height
}: {
	beatmap: Beatmap;
	score?: Score;
	simulation: SimulatedFrame[];
	width: number;
	height: number;
}): Promise<Renderer> => {
	const renderer = new Application();
	const offsetX = (width - BASE_WIDTH) / 2;
	const offsetY = (height - BASE_HEIGHT) / 2;

	await renderer.init({ backgroundColor: 0x000000, width, height, antialias: true });

	const preempt = calcPreempt(beatmap.difficulty.approachRate);
	const objectRadius = calcObjectRadius(beatmap.difficulty.circleSize);
	const cursor = new Graphics();
	renderer.stage.addChild(cursor);

	const scoreText = new Text({
		text: 0,
		style: {
			fill: 0xffffff
		}
	});
	renderer.stage.addChild(scoreText);

	const circles: {
		hitObject: HitObject;
		hitCircle: Graphics;
		approachCircle: Graphics;
		hitCircleText: Text;
	}[] = [];

	let hitColorIndex = 0;
	let hitCircleNumber = 1;
	for (const hitObject of beatmap.hitObjects) {
		const hitCircle = new Graphics();
		if ((hitObject.hitType >> 2) & 1) {
			hitColorIndex = (hitColorIndex + 1) % beatmap.colors.comboColors.length;
			hitCircleNumber = 1;
		}
		const hitCircleText = new Text({
			text: hitCircleNumber,
			x: hitObject.startX + offsetX,
			y: hitObject.startY + offsetY,
			zIndex: -hitObject.startTime,
			alpha: 0,
			visible: false,
			anchor: 0.5,
			style: { fill: 0xffffff }
		});
		hitCircleNumber += 1;
		const color = beatmap.colors.comboColors[hitColorIndex];
		const hexColor = (color.red << 16) + (color.green << 8) + color.blue;
		hitCircle.circle(hitObject.startX + offsetX, hitObject.startY + offsetY, objectRadius);
		hitCircle.fill(hexColor);
		hitCircle.stroke(0x000000);
		hitCircle.zIndex = -hitObject.startTime;
		hitCircle.alpha = 0;
		hitCircle.visible = false;
		renderer.stage.addChild(hitCircle);

		renderer.stage.addChild(hitCircleText);

		const approachCircle = new Graphics();
		approachCircle.visible = false;
		approachCircle.zIndex = -hitObject.startTime;
		renderer.stage.addChild(approachCircle);

		circles.push({ hitObject, hitCircle, approachCircle, hitCircleText });
	}

	const update = (time: number) => {
		for (const { hitObject, hitCircle, hitCircleText, approachCircle } of circles) {
			if (time >= hitObject.startTime - preempt && time <= hitObject.startTime) {
				const alpha = calcAlpha(time, beatmap.difficulty.approachRate, hitObject);
				hitCircle.visible = true;
				hitCircleText.visible = true;
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
				hitCircleText.alpha = alpha;
				approachCircle.alpha = alpha;
			} else {
				hitCircle.visible = false;
				hitCircleText.visible = false;
				approachCircle.visible = false;
			}
		}

		if (score?.replay) {
			const frameIndex = score.replay.frames.findIndex((frame) => frame.startTime > time) - 1;
			const frame = score.replay.frames[Math.max(0, frameIndex)];

			const y = hr(score.info.rawMods) ? BASE_HEIGHT - frame.position.y : frame.position.y;
			cursor.moveTo(frame.position.x + offsetX, y + offsetY);
			cursor.clear();
			cursor.circle(frame.position.x + offsetX, y + offsetY, 5);
			cursor.fill(0xff0000);
			scoreText.text = simulation[frameIndex].score;
		}
	};

	return {
		update,
		canvas: renderer.canvas
	};
};
