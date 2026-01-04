import { getSkinAsset } from '$lib/asset_urls';
import { Assets, Container, Sprite, Text } from 'pixi.js';

function approachCircleRadius({
	timeRemaining,
	preempt,
	radius
}: {
	timeRemaining: number;
	preempt: number;
	radius: number;
}) {
	const progress = Math.min(Math.max(1 - timeRemaining / preempt, 0), 1); // Clamped between 0 and 1
	const approachRadius = (3 - 2 * progress) * radius;

	return approachRadius;
}

export class HitCircle extends Container {
	hitCircle: Sprite | undefined;
	hitCircleOverlay: Sprite | undefined;
	hitCircleText: Text | undefined;
	approachCircle: Sprite | undefined;
	time: number;
	resultTime: number;
	radius: number;
	preempt: number;
	constructor({
		x,
		y,
		time,
		resultTime,
		number,
		color,
		radius,
		preempt
	}: {
		x: number;
		y: number;
		time: number;
		resultTime: number;
		number: number;
		color: number;
		radius: number;
		preempt: number;
	}) {
		super();
		this.time = time;
		this.resultTime = resultTime;
		this.radius = radius;
		this.preempt = preempt;
		Promise.all([
			Assets.load(getSkinAsset('hitcircle.png')),
			Assets.load(getSkinAsset('hitcircleoverlay.png')),
			Assets.load(getSkinAsset('approachcircle.png'))
		]).then(([hitCircleSprite, hitCircleOverlaySprite, approachCircleSprite]) => {
			this.hitCircle = new Sprite({
				texture: hitCircleSprite,
				x,
				y,
				width: radius * 2,
				height: radius * 2,
				tint: color,
				anchor: 0.5
			});
			this.addChild(this.hitCircle);

			this.hitCircleOverlay = new Sprite({
				texture: hitCircleOverlaySprite,
				x,
				y,
				width: radius * 2,
				height: radius * 2,
				anchor: 0.5
			});
			this.addChild(this.hitCircleOverlay);

			this.hitCircleText = new Text({
				text: number,
				x,
				y,
				anchor: 0.5,
				style: { fill: 0xffffff, fontSize: radius / 2 }
			});
			this.addChild(this.hitCircleText);

			this.approachCircle = new Sprite({
				texture: approachCircleSprite,
				x,
				y,
				width: radius * 2 * 4,
				height: radius * 2 * 4,
				tint: color,
				zIndex: -1,
				anchor: 0.5
			});
			this.addChild(this.approachCircle);
		});
	}
	update(time: number): void {
		const radius = approachCircleRadius({
			timeRemaining: this.time - time,
			preempt: this.preempt,
			radius: this.radius
		});
		this.approachCircle?.setSize(radius * 2, radius * 2);
	}
}
