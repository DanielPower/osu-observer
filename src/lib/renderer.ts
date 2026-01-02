import { HitResult, Score, type Beatmap } from 'osu-classes';
import { Application, Assets, Graphics, Sprite, Text } from 'pixi.js';
import { calcPreempt, calcObjectRadius, calcAlpha } from './osu_math';
import type { HitObject, Simulation } from './osu_simulation';

const PLAY_WIDTH = 512;
const PLAY_HEIGHT = 384;
const GAME_WIDTH = 640;
const GAME_HEIGHT = 480;

const resultText = (result: HitResult) =>
	(
		({
			[HitResult.Good]: '100',
			[HitResult.Ok]: '100',
			[HitResult.Meh]: '50',
			[HitResult.Great]: '300',
			[HitResult.Perfect]: '300',
			[HitResult.Miss]: 'Miss'
		}) as Record<HitResult, string>
	)[result];

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
	simulation: Simulation;
	width: number;
	height: number;
}): Promise<Renderer> => {
	const renderer = new Application();
	const scale = height / GAME_HEIGHT;

	const offsetX = (GAME_WIDTH - PLAY_HEIGHT) / 2 * (width / GAME_WIDTH);
	const offsetY = (GAME_HEIGHT - PLAY_HEIGHT) / 2 * (height / GAME_HEIGHT);

	await renderer.init({ width, height, antialias: true });

	const preempt = calcPreempt(beatmap.difficulty.approachRate);
	const objectRadius = calcObjectRadius(beatmap.difficulty.circleSize) * scale;
	const cursor = new Graphics();
	renderer.stage.addChild(cursor);

	const scoreText = new Text({
		text: 0,
		style: {
			fill: 0xffffff,
			fontSize: 16 * scale
		}
	});
	renderer.stage.addChild(scoreText);

	const comboText = new Text({
		text: 0,
		y: 30 * scale,
		style: {
			fill: 0xffffff,
			fontSize: 16 * scale
		},
		anchor: 0
	});
	renderer.stage.addChild(comboText);

	const accuracyText = new Text({
		text: 0,
		y: 60 * scale,
		style: {
			fill: 0xffffff,
			fontSize: 16 * scale
		},
		anchor: 0
	});
	renderer.stage.addChild(accuracyText);

	const circles: {
		hitObject: HitObject;
		hitCircle: Graphics;
		approachCircle: Graphics;
		hitCircleText: Text;
		hitCircleResultText: Text;
	}[] = [];

	if (beatmap.events.backgroundPath) {
		const texture = await Assets.load(
			`/beatmaps/${beatmap.metadata.beatmapSetId}/${beatmap.events.backgroundPath}`
		);
		const background = new Sprite(texture);
		background.zIndex = -10000000;
		background.alpha = 0.3;
		background.width = renderer.screen.width;
		background.height = renderer.screen.height;
		renderer.stage.addChild(background);
	}

	let hitColorIndex = 0;
	let hitCircleNumber = 1;
	for (const hitObject of simulation.hitObjects) {
		const hitCircle = new Graphics();
		if ((hitObject.type >> 2) & 1) {
			hitColorIndex = (hitColorIndex + 1) % beatmap.colors.comboColors.length;
			hitCircleNumber = 1;
		}
		const hitCircleText = new Text({
			text: hitCircleNumber,
			x: hitObject.x * scale + offsetX,
			y: hitObject.y * scale + offsetY,
			zIndex: -hitObject.time,
			alpha: 0,
			visible: false,
			anchor: 0.5,
			style: { fill: 0xffffff, fontSize: 20 * scale }
		});
		const hitCircleResultText = new Text({
			x: hitObject.x * scale + offsetX,
			y: hitObject.y * scale + offsetY,
			text: resultText(hitObject.result),
			zIndex: -hitObject.time,
			alpha: 0,
			visible: false,
			anchor: 0.5,
			style: { fill: 0xffffff, fontSize: 20 * scale }
		});

		hitCircleNumber += 1;
		const color = beatmap.colors.comboColors[hitColorIndex];
		const hexColor = (color.red << 16) + (color.green << 8) + color.blue;
		hitCircle.circle(hitObject.x * scale + offsetX, hitObject.y * scale + offsetY, objectRadius);
		hitCircle.fill(hexColor);
		hitCircle.stroke(0x000000);
		hitCircle.zIndex = -hitObject.time;
		hitCircle.alpha = 0;
		hitCircle.visible = false;
		renderer.stage.addChild(hitCircle);

		renderer.stage.addChild(hitCircleText);
		renderer.stage.addChild(hitCircleResultText);

		const approachCircle = new Graphics();
		approachCircle.visible = false;
		approachCircle.zIndex = -hitObject.time;
		renderer.stage.addChild(approachCircle);

		circles.push({ hitObject, hitCircle, approachCircle, hitCircleText, hitCircleResultText });
	}

	const update = (time: number) => {
		for (const {
			hitObject,
			hitCircle,
			hitCircleText,
			approachCircle,
			hitCircleResultText
		} of circles) {
			if (time >= hitObject.time - preempt && time <= hitObject.resultTime) {
				const alpha = calcAlpha(time, beatmap.difficulty.approachRate, hitObject);
				hitCircle.visible = true;
				hitCircleText.visible = true;
				approachCircle.visible = true;
				approachCircle.clear();
				approachCircle.circle(
				hitObject.x * scale + offsetX,
				hitObject.y * scale + offsetY,
					approachCircleRadius({
						timeRemaining: hitObject.time - time,
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
			if (time > hitObject.resultTime && time < hitObject.resultTime + 200) {
				hitCircleResultText.visible = true;
				hitCircleResultText.alpha = 1;
			} else {
				hitCircleResultText.visible = false;
				hitCircleResultText.alpha = 0;
			}
		}

		if (score?.replay) {
			const frameIndex = simulation.frames.findIndex((frame) => frame.time > time) - 1;
			const frame =
				simulation.frames[frameIndex] || simulation.frames[simulation.frames.length - 1];

			const y = hr(score.info.rawMods) ? GAME_HEIGHT - frame.y : frame.y;
			cursor.moveTo(frame.x * scale + offsetX, y * scale + offsetY);
			cursor.clear();
			cursor.circle(frame.x * scale + offsetX, y * scale + offsetY, 5 * scale);
			cursor.fill(0xff0000);
			scoreText.text = `Score: ${frame.score}`;
			comboText.text = `Combo: ${frame.combo}`;
			accuracyText.text = `Accuracy: ${frame.accuracy * 100}`;
		}
	};

	return {
		update,
		canvas: renderer.canvas
	};
};
