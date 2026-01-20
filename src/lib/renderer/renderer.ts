import { HitResult, Replay } from 'osu-classes';
import { Application, Assets, Sprite, Text, Texture } from 'pixi.js';
import { calcPreempt, calcObjectRadius, calcAlpha, lerp2D, calcCursorSize } from '$lib/osu_math';
import type { HitObject, SimulatedFrame, Simulation } from '$lib/osu_simulation';
import { env } from '$env/dynamic/public';
import { StandardBeatmap } from 'osu-standard-stable';
import { HitCircle } from './hitcircle';
import { Spinner } from './spinner';
import { SliderObject } from './slider';
import { textures } from '$lib/skin';

/**
 * Binary search to find the index of the first frame with time > targetTime.
 * Returns frames.length if all frames have time <= targetTime.
 * Returns 0 if all frames have time > targetTime.
 */
function findNextFrameIndex(frames: SimulatedFrame[], targetTime: number): number {
	let low = 0;
	let high = frames.length;

	while (low < high) {
		const mid = (low + high) >>> 1;
		if (frames[mid].time > targetTime) {
			high = mid;
		} else {
			low = mid + 1;
		}
	}

	return low;
}

type Circle = {
	hitObject: HitObject;
	hitCircle: HitCircle;
};

type SliderRenderObject = {
	hitObject: HitObject;
	slider: SliderObject;
};

type SpinnerRenderObject = {
	hitObject: HitObject;
	spinner: Spinner;
};

type HitResultObject = {
	hitObject: HitObject;
	sprite: Sprite;
};

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

const resultTexture = (result: HitResult): Texture =>
	(
		({
			[HitResult.Good]: textures.hit100,
			[HitResult.Ok]: textures.hit100,
			[HitResult.Meh]: textures.hit50,
			[HitResult.Great]: textures.hit300,
			[HitResult.Perfect]: textures.hit300,
			[HitResult.Miss]: textures.hit0
		}) as Record<HitResult, Texture>
	)[result];

export type Renderer = {
	app: Application;
	canvas: HTMLCanvasElement;
	update: (time: number) => void;
	destroy: () => void;
	setBackgroundDim: (dim: number) => void;
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
	const cursor = new Sprite({
		texture: textures.cursor,
		scale: calcCursorSize(beatmap.difficulty.circleSize),
		anchor: 0.5
	});
	renderer.stage.addChild(cursor);

	const debugText = new Text({
		text: 0,
		style: {
			fill: 0xffffff,
			fontSize: 16 * scale
		}
	});
	renderer.stage.addChild(debugText);

	const circles: Circle[] = [];
	const sliders: SliderRenderObject[] = [];
	const spinners: SpinnerRenderObject[] = [];
	const hitResults: HitResultObject[] = [];

	let background: Sprite | null = null;
	if (beatmap.events.backgroundPath) {
		const texture = await Assets.load(
			`${env.PUBLIC_SERVE_MEDIA_PATH}/beatmaps/${beatmap.metadata.beatmapSetId}/${beatmap.events.backgroundPath}`
		);
		background = new Sprite(texture);
		background.zIndex = -10000000;
		background.alpha = 1;
		background.width = renderer.screen.width;
		background.height = renderer.screen.height;
		renderer.stage.addChild(background);
	}

	const setBackgroundDim = (dim: number) => {
		if (background) {
			background.alpha = 1 - dim;
		}
	};

	// Helper to create and register a hit result sprite
	const createHitResultSprite = (hitObject: HitObject, x: number, y: number): void => {
		const sprite = new Sprite({
			texture: resultTexture(hitObject.result),
			x,
			y,
			zIndex: -hitObject.time,
			alpha: 0,
			visible: false,
			anchor: 0.5,
			scale: scale * 0.5
		});
		renderer.stage.addChild(sprite);
		hitResults.push({ hitObject, sprite });
	};

	let hitColorIndex = 0;
	let hitCircleNumber = 1;
	for (const hitObject of simulation.hitObjects) {
		// Check if this is a spinner (bit 3 set)
		if ((hitObject.type >> 3) & 1) {
			const spinner = new Spinner({
				x: width / 2,
				y: height / 2,
				startTime: hitObject.time,
				endTime: hitObject.endTime!,
				radius: 100 * scale,
				scale,
				overallDifficulty: beatmap.difficulty.overallDifficulty
			});

			spinner.zIndex = -hitObject.time;
			spinner.alpha = 0;
			spinner.visible = false;
			renderer.stage.addChild(spinner);

			spinners.push({ hitObject, spinner });
			createHitResultSprite(hitObject, width / 2, height / 2);
			continue;
		}

		// Handle new combo
		if ((hitObject.type >> 2) & 1) {
			hitColorIndex = (hitColorIndex + 1) % beatmap.colors.comboColors.length;
			hitCircleNumber = 1;
		}
		const color = beatmap.colors.comboColors[hitColorIndex];
		const hexColor = (color.red << 16) + (color.green << 8) + color.blue;

		const hitObjectX = hitObject.x * scale + offsetX;
		const hitObjectY = hitObject.y * scale + offsetY;

		// Check if this is a slider (bit 1 set)
		if ((hitObject.type >> 1) & 1 && hitObject.slider) {
			const slider = new SliderObject({
				x: hitObjectX,
				y: hitObjectY,
				time: hitObject.time,
				endTime: hitObject.endTime!,
				number: hitCircleNumber,
				color: hexColor,
				radius: objectRadius,
				preempt,
				sliderData: hitObject.slider,
				scale,
				offsetX,
				offsetY,
				renderer: renderer.renderer
			});

			hitCircleNumber += 1;
			slider.zIndex = -hitObject.time;
			slider.alpha = 0;
			slider.visible = false;
			renderer.stage.addChild(slider);

			sliders.push({ hitObject, slider });
			createHitResultSprite(hitObject, hitObjectX, hitObjectY);
			continue;
		}

		// Regular hit circle
		const hitCircle = new HitCircle({
			x: hitObjectX,
			y: hitObjectY,
			time: hitObject.time,
			resultTime: hitObject.resultTime,
			number: hitCircleNumber,
			color: hexColor,
			radius: objectRadius,
			preempt
		});

		hitCircleNumber += 1;
		hitCircle.zIndex = -hitObject.time;
		hitCircle.alpha = 0;
		hitCircle.visible = false;
		renderer.stage.addChild(hitCircle);

		circles.push({ hitObject, hitCircle });
		createHitResultSprite(hitObject, hitObjectX, hitObjectY);
	}

	const update = (time: number) => {
		// Get current frame for spinner rotation and slider tracking
		const nextFrameIndex = findNextFrameIndex(simulation.frames, time);
		const currentFrame =
			simulation.frames[nextFrameIndex - 1] || simulation.frames[simulation.frames.length - 1];

		// Update spinners
		for (const { hitObject, spinner } of spinners) {
			if (time >= hitObject.time && time <= hitObject.endTime!) {
				spinner.visible = true;
				const rotation = currentFrame.currentSpinnerRotation || 0;
				spinner.update(time, rotation);
				spinner.alpha = 1;
			} else {
				spinner.visible = false;
			}
		}

		// Update sliders
		for (const { hitObject, slider } of sliders) {
			const sliderEndTime = hitObject.endTime!;

			// Slider is visible from preempt time before start until end
			if (time >= hitObject.time - preempt && time <= sliderEndTime) {
				const alpha = calcAlpha(time, beatmap.difficulty.approachRate, hitObject);
				slider.visible = true;
				slider.alpha = alpha;

				// Determine if currently tracking (simplified - check if any action is pressed)
				const isTracking =
					currentFrame.activeSliderProgress !== undefined &&
					time >= hitObject.time &&
					time <= sliderEndTime;

				slider.update(time, isTracking);
			} else {
				slider.visible = false;
			}
		}

		// Update hit circles
		for (const { hitObject, hitCircle } of circles) {
			if (time >= hitObject.time - preempt && time <= hitObject.resultTime) {
				const alpha = calcAlpha(time, beatmap.difficulty.approachRate, hitObject);
				hitCircle.visible = true;
				hitCircle.update(time);
				hitCircle.alpha = alpha;
			} else {
				hitCircle.visible = false;
			}
		}

		// Update hit result sprites (consolidated logic for all object types)
		for (const { hitObject, sprite } of hitResults) {
			const resultTime = hitObject.endTime ?? hitObject.resultTime;
			if (time > resultTime && time < resultTime + 200) {
				sprite.visible = true;
				sprite.alpha = 1;
			} else {
				sprite.visible = false;
				sprite.alpha = 0;
			}
		}

		if (replay) {
			const nextFrameIndex = findNextFrameIndex(simulation.frames, time);
			const currentFrame =
				simulation.frames[nextFrameIndex - 1] || simulation.frames[simulation.frames.length - 1];
			const nextFrame =
				simulation.frames[nextFrameIndex] || simulation.frames[simulation.frames.length - 1];
			const { x, y } = lerp2D(
				currentFrame.time,
				currentFrame.x,
				currentFrame.y,
				nextFrame.time,
				nextFrame.x,
				nextFrame.y,
				time
			);

			cursor.x = x * scale + offsetX;
			cursor.y = y * scale + offsetY;
			debugText.text = getDebugText(currentFrame);
		}
	};

	return {
		app: renderer,
		canvas: renderer.canvas,
		update,
		destroy: () => {
			renderer.destroy(true, { children: true, texture: true });
		},
		setBackgroundDim
	};
};
