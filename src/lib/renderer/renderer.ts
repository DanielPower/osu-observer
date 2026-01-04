import { HitResult, Replay } from 'osu-classes';
import { Application, Assets, Graphics, Sprite, Text } from 'pixi.js';
import { calcPreempt, calcObjectRadius, calcAlpha } from '$lib/osu_math';
import type { HitObject, SimulatedFrame, Simulation } from '$lib/osu_simulation';
import { env } from '$env/dynamic/public';
import { StandardBeatmap } from 'osu-standard-stable';
import { HitCircle } from './hitcircle';

const PLAY_WIDTH = 512;
const PLAY_HEIGHT = 384;
const GAME_WIDTH = 640;
const GAME_HEIGHT = 480;

const getDebugText = (frame: SimulatedFrame) =>
	`Time: ${frame.time}
X: ${frame.x}
Y: ${frame.y}
Score: ${frame.score}
Combo: ${frame.combo}
Accuracy: ${(frame.accuracy * 100).toFixed(2)}%
300s: ${frame.great}
100s: ${frame.good}
50s: ${frame.okay}
Misses: ${frame.miss}`;

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

export type Renderer = {
	update: (time: number) => void;
	canvas: HTMLCanvasElement;
};

export const createRenderer = async ({
	beatmap,
	replay,
	simulation,
	width,
	height
}: {
	beatmap: StandardBeatmap;
	replay?: Replay;
	simulation: Simulation;
	width: number;
	height: number;
}): Promise<Renderer> => {
	const renderer = new Application();
	const scale = height / GAME_HEIGHT;

	const offsetX = ((GAME_WIDTH - PLAY_HEIGHT) / 2) * (width / GAME_WIDTH);
	const offsetY = ((GAME_HEIGHT - PLAY_HEIGHT) / 2) * (height / GAME_HEIGHT);

	await renderer.init({ width, height, antialias: true });

	const preempt = calcPreempt(beatmap.difficulty.approachRate);
	const objectRadius = calcObjectRadius(beatmap.difficulty.circleSize) * scale;
	const cursor = new Graphics();
	renderer.stage.addChild(cursor);

	const debugText = new Text({
		text: 0,
		style: {
			fill: 0xffffff,
			fontSize: 16 * scale
		}
	});
	renderer.stage.addChild(debugText);

	const circles: {
		hitObject: HitObject;
		hitCircle: HitCircle;
		hitCircleResultText: Text;
	}[] = [];

	if (beatmap.events.backgroundPath) {
		const texture = await Assets.load(
			`${env.PUBLIC_SERVE_MEDIA_PATH}/beatmaps/${beatmap.metadata.beatmapSetId}/${beatmap.events.backgroundPath}`
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
		if ((hitObject.type >> 2) & 1) {
			hitColorIndex = (hitColorIndex + 1) % beatmap.colors.comboColors.length;
			hitCircleNumber = 1;
		}
		const color = beatmap.colors.comboColors[hitColorIndex];
		const hexColor = (color.red << 16) + (color.green << 8) + color.blue;

		const hitCircle = new HitCircle({
			x: hitObject.x * scale + offsetX,
			y: hitObject.y * scale + offsetY,
			time: hitObject.time,
			resultTime: hitObject.resultTime,
			number: hitCircleNumber,
			color: hexColor,
			radius: objectRadius,
			preempt
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
		hitCircle.zIndex = -hitObject.time;
		hitCircle.alpha = 0;
		hitCircle.visible = false;
		renderer.stage.addChild(hitCircle);
		renderer.stage.addChild(hitCircleResultText);

		circles.push({
			hitObject,
			hitCircle,
			hitCircleResultText
		});
	}

	const update = (time: number) => {
		for (const { hitObject, hitCircle, hitCircleResultText } of circles) {
			if (time >= hitObject.time - preempt && time <= hitObject.resultTime) {
				const alpha = calcAlpha(time, beatmap.difficulty.approachRate, hitObject);
				hitCircle.visible = true;
				hitCircle.update(time);
				hitCircle.alpha = alpha;
			} else {
				hitCircle.visible = false;
			}
			if (time > hitObject.resultTime && time < hitObject.resultTime + 200) {
				hitCircleResultText.visible = true;
				hitCircleResultText.alpha = 1;
			} else {
				hitCircleResultText.visible = false;
				hitCircleResultText.alpha = 0;
			}
		}

		if (replay) {
			const frameIndex = simulation.frames.findIndex((frame) => frame.time > time) - 1;
			const frame =
				simulation.frames[frameIndex] || simulation.frames[simulation.frames.length - 1];

			cursor.moveTo(frame.x * scale + offsetX, frame.y * scale + offsetY);
			cursor.clear();
			cursor.circle(frame.x * scale + offsetX, frame.y * scale + offsetY, 5 * scale);
			cursor.fill(0xff0000);
			debugText.text = getDebugText(frame);
		}
	};

	return {
		update,
		canvas: renderer.canvas
	};
};
