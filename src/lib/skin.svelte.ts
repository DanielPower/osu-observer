import { Assets, Texture } from 'pixi.js';
import { getSkinAsset } from './asset_urls';

export const hitCircleTexture = new Texture();
export const hitCircleOverlayTexture = new Texture();
export const approachCircleTexture = new Texture();
export const cursorTexture = new Texture();

export const updateSkinTextures = async (skin: string) => {
	const [
		newHitCircleTexture,
		newHitCircleOverlayTexture,
		newApproachCircleTexture,
		newCursorTexture
	] = await Promise.all([
		Assets.load(getSkinAsset(skin, 'hitcircle.png')),
		Assets.load(getSkinAsset(skin, 'hitcircleoverlay.png')),
		Assets.load(getSkinAsset(skin, 'approachcircle.png')),
		Assets.load(getSkinAsset(skin, 'cursor.png'))
	]);

	hitCircleTexture.source = newHitCircleTexture.source;
	hitCircleTexture.source.update();
	hitCircleTexture.update();
	hitCircleOverlayTexture.source = newHitCircleOverlayTexture.source;
	hitCircleOverlayTexture.source.update();
	hitCircleOverlayTexture.update();
	approachCircleTexture.source = newApproachCircleTexture.source;
	approachCircleTexture.source.update();
	approachCircleTexture.update();
	cursorTexture.source = newCursorTexture.source;
	cursorTexture.source.update();
	cursorTexture.update();
};
