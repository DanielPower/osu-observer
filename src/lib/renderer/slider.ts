import { Container, Sprite, Graphics, Text } from 'pixi.js';
import { textures } from '$lib/skin';
import type { SliderData, Coordinate } from '$lib/osu_simulation';

function approachCircleRadius({
	timeRemaining,
	preempt,
	radius
}: {
	timeRemaining: number;
	preempt: number;
	radius: number;
}) {
	const progress = Math.min(Math.max(1 - timeRemaining / preempt, 0), 1);
	const approachRadius = (3 - 2 * progress) * radius;
	return approachRadius;
}

export class SliderObject extends Container {
	private sliderBody: Graphics;
	private sliderBorder: Graphics;
	private startCircle: Sprite;
	private startCircleOverlay: Sprite;
	private endCircle: Sprite;
	private endCircleOverlay: Sprite;
	private sliderBall: Sprite;
	private followCircle: Sprite;
	private approachCircle: Sprite;
	private numberText: Text;
	private tickSprites: Sprite[] = [];
	private reverseArrows: Sprite[] = [];

	private startTime: number;
	private endTime: number;
	private radius: number;
	private preempt: number;
	private sliderData: SliderData;
	private startX: number;
	private startY: number;
	private renderScale: number;
	private offsetX: number;
	private offsetY: number;
	private color: number;

	constructor({
		x,
		y,
		time,
		endTime,
		number,
		color,
		radius,
		preempt,
		sliderData,
		scale,
		offsetX,
		offsetY
	}: {
		x: number;
		y: number;
		time: number;
		endTime: number;
		number: number;
		color: number;
		radius: number;
		preempt: number;
		sliderData: SliderData;
		scale: number;
		offsetX: number;
		offsetY: number;
	}) {
		super();

		this.startTime = time;
		this.endTime = endTime;
		this.radius = radius;
		this.preempt = preempt;
		this.sliderData = sliderData;
		this.startX = x;
		this.startY = y;
		this.renderScale = scale;
		this.offsetX = offsetX;
		this.offsetY = offsetY;
		this.color = color;

		// Create slider body (the track)
		this.sliderBorder = new Graphics();
		this.addChild(this.sliderBorder);

		this.sliderBody = new Graphics();
		this.addChild(this.sliderBody);

		// Draw the slider path
		this.drawSliderPath();

		// Create tick sprites
		for (const tick of sliderData.tickPositions) {
			const tickSprite = new Sprite({
				texture: textures.sliderscorepoint,
				x: tick.position.x * this.renderScale + offsetX,
				y: tick.position.y * this.renderScale + offsetY,
				anchor: 0.5,
				scale: { x: 0.5, y: 0.5 }
			});
			this.tickSprites.push(tickSprite);
			this.addChild(tickSprite);
		}

		// Create reverse arrows
		for (let i = 0; i < sliderData.repeatPositions.length; i++) {
			const repeat = sliderData.repeatPositions[i];
			const reverseArrow = new Sprite({
				texture: textures.reversearrow,
				x: repeat.position.x * this.renderScale + offsetX,
				y: repeat.position.y * this.renderScale + offsetY,
				anchor: 0.5,
				width: radius * 1.8,
				height: radius * 1.8
			});

			// Calculate rotation to point towards next direction
			const isAtEnd = i % 2 === 0;
			if (sliderData.path.length >= 2) {
				let targetPoint: Coordinate;
				if (isAtEnd) {
					// At end, point back towards start
					targetPoint = sliderData.path[sliderData.path.length - 2];
				} else {
					// At start, point towards end
					targetPoint = sliderData.path[1];
				}
				const dx = targetPoint.x * this.renderScale + offsetX - reverseArrow.x;
				const dy = targetPoint.y * this.renderScale + offsetY - reverseArrow.y;
				reverseArrow.rotation = Math.atan2(dy, dx);
			}

			this.reverseArrows.push(reverseArrow);
			this.addChild(reverseArrow);
		}

		// End circle (drawn first so start circle appears on top)
		const endX = sliderData.endPosition.x * this.renderScale + offsetX;
		const endY = sliderData.endPosition.y * this.renderScale + offsetY;

		this.endCircle = new Sprite({
			texture: textures.sliderendcircle,
			x: endX,
			y: endY,
			width: radius * 2,
			height: radius * 2,
			tint: color,
			anchor: 0.5
		});
		this.addChild(this.endCircle);

		this.endCircleOverlay = new Sprite({
			texture: textures.sliderendcircleoverlay,
			x: endX,
			y: endY,
			width: radius * 2,
			height: radius * 2,
			anchor: 0.5
		});
		this.addChild(this.endCircleOverlay);

		// Start circle
		this.startCircle = new Sprite({
			texture: textures.sliderstartcircle,
			x: x,
			y: y,
			width: radius * 2,
			height: radius * 2,
			tint: color,
			anchor: 0.5
		});
		this.addChild(this.startCircle);

		this.startCircleOverlay = new Sprite({
			texture: textures.sliderstartcircleoverlay,
			x: x,
			y: y,
			width: radius * 2,
			height: radius * 2,
			anchor: 0.5
		});
		this.addChild(this.startCircleOverlay);

		// Number text
		this.numberText = new Text({
			text: number,
			x: x,
			y: y,
			anchor: 0.5,
			style: { fill: 0xffffff, fontSize: radius / 2 }
		});
		this.addChild(this.numberText);

		// Approach circle
		this.approachCircle = new Sprite({
			texture: textures.approachcircle,
			x: x,
			y: y,
			width: radius * 2 * 4,
			height: radius * 2 * 4,
			tint: color,
			anchor: 0.5
		});
		this.addChild(this.approachCircle);

		// Follow circle (hidden by default)
		this.followCircle = new Sprite({
			texture: textures.sliderfollowcircle,
			x: x,
			y: y,
			width: radius * 4.8,
			height: radius * 4.8,
			anchor: 0.5,
			alpha: 0
		});
		this.addChild(this.followCircle);

		// Slider ball (hidden by default)
		this.sliderBall = new Sprite({
			texture: textures.sliderb,
			x: x,
			y: y,
			width: radius * 2,
			height: radius * 2,
			tint: color,
			anchor: 0.5,
			alpha: 0
		});
		this.addChild(this.sliderBall);
	}

	private drawSliderPath(): void {
		const path = this.sliderData.path;
		if (path.length < 2) return;

		const borderWidth = this.radius * 2 + 4;
		const bodyWidth = this.radius * 2 - 4;

		// Draw border (darker outline)
		this.sliderBorder.moveTo(
			path[0].x * this.renderScale + this.offsetX,
			path[0].y * this.renderScale + this.offsetY
		);

		for (let i = 1; i < path.length; i++) {
			this.sliderBorder.lineTo(
				path[i].x * this.renderScale + this.offsetX,
				path[i].y * this.renderScale + this.offsetY
			);
		}

		this.sliderBorder.stroke({
			width: borderWidth,
			color: 0xffffff,
			alpha: 0.8,
			cap: 'round',
			join: 'round'
		});

		// Draw body (inner track with combo color)
		this.sliderBody.moveTo(
			path[0].x * this.renderScale + this.offsetX,
			path[0].y * this.renderScale + this.offsetY
		);

		for (let i = 1; i < path.length; i++) {
			this.sliderBody.lineTo(
				path[i].x * this.renderScale + this.offsetX,
				path[i].y * this.renderScale + this.offsetY
			);
		}

		// Use a darkened version of the combo color for the body
		const r = ((this.color >> 16) & 0xff) * 0.3;
		const g = ((this.color >> 8) & 0xff) * 0.3;
		const b = (this.color & 0xff) * 0.3;
		const bodyColor = (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);

		this.sliderBody.stroke({
			width: bodyWidth,
			color: bodyColor,
			alpha: 0.7,
			cap: 'round',
			join: 'round'
		});
	}

	update(time: number, isTracking: boolean = false): void {
		// Update approach circle before slider starts
		if (time < this.startTime) {
			const approachRadius = approachCircleRadius({
				timeRemaining: this.startTime - time,
				preempt: this.preempt,
				radius: this.radius
			});
			this.approachCircle.setSize(approachRadius * 2, approachRadius * 2);
			this.approachCircle.alpha = 1;
		} else {
			this.approachCircle.alpha = 0;
		}

		// During slider active time
		if (time >= this.startTime && time <= this.endTime) {
			// Calculate slider ball position
			const progress = (time - this.startTime) / this.sliderData.duration;
			const totalSpans = this.sliderData.repeats + 1;
			const currentSpan = Math.floor(progress * totalSpans);
			const spanProgress = (progress * totalSpans) % 1;

			// Determine if we're going forward or backward
			const isReverse = currentSpan % 2 === 1;
			const pathProgress = isReverse ? 1 - spanProgress : spanProgress;

			// Get position along path
			const pathIndex = Math.min(
				Math.floor(pathProgress * (this.sliderData.path.length - 1)),
				this.sliderData.path.length - 2
			);
			const localProgress = pathProgress * (this.sliderData.path.length - 1) - pathIndex;

			const p1 = this.sliderData.path[pathIndex];
			const p2 = this.sliderData.path[Math.min(pathIndex + 1, this.sliderData.path.length - 1)];

			const ballX = (p1.x + (p2.x - p1.x) * localProgress) * this.renderScale + this.offsetX;
			const ballY = (p1.y + (p2.y - p1.y) * localProgress) * this.renderScale + this.offsetY;

			// Update slider ball position
			this.sliderBall.x = ballX;
			this.sliderBall.y = ballY;
			this.sliderBall.alpha = 1;

			// Update follow circle
			this.followCircle.x = ballX;
			this.followCircle.y = ballY;
			this.followCircle.alpha = isTracking ? 1 : 0;

			// Hide start circle elements after slider starts
			this.startCircle.alpha = 0;
			this.startCircleOverlay.alpha = 0;
			this.numberText.alpha = 0;

			// Update tick visibility (hide ticks that have been passed)
			for (let i = 0; i < this.tickSprites.length; i++) {
				const tick = this.sliderData.tickPositions[i];
				this.tickSprites[i].alpha = time >= tick.time ? 0 : 1;
			}

			// Update reverse arrow visibility and pulsing
			for (let i = 0; i < this.reverseArrows.length; i++) {
				const repeat = this.sliderData.repeatPositions[i];
				if (time >= repeat.time) {
					this.reverseArrows[i].alpha = 0;
				} else {
					// Pulse effect
					const timeTillRepeat = repeat.time - time;
					const pulse = 1 + 0.1 * Math.sin((timeTillRepeat / 200) * Math.PI * 2);
					this.reverseArrows[i].scale.set(
						(pulse * this.radius * 1.8) / this.reverseArrows[i].texture.width
					);
					this.reverseArrows[i].alpha = 1;
				}
			}
		} else {
			// Before slider starts
			this.sliderBall.alpha = 0;
			this.followCircle.alpha = 0;
			this.startCircle.alpha = 1;
			this.startCircleOverlay.alpha = 1;
			this.numberText.alpha = 1;

			// Show all ticks
			for (const tick of this.tickSprites) {
				tick.alpha = 1;
			}

			// Show all reverse arrows
			for (const arrow of this.reverseArrows) {
				arrow.alpha = 1;
			}
		}
	}
}
