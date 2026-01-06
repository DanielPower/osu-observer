import { Assets, Texture } from 'pixi.js';
import { getSkinAsset } from './asset_urls';

export const hitCircleTexture = new Texture();
export const hitCircleOverlayTexture = new Texture();
export const approachCircleTexture = new Texture();

export const updateSkinTextures = async (skin: string) => {
	const [newHitCircleTexture, newHitCircleOverlayTexture, newApproachCircleTexture] =
		await Promise.all([
			Assets.load(getSkinAsset(skin, 'hitcircle.png')),
			Assets.load(getSkinAsset(skin, 'hitcircleoverlay.png')),
			Assets.load(getSkinAsset(skin, 'approachcircle.png'))
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
};

// export const getSkin = (skin: string) => {
// 	return {
// 		hitCircleSprite: new Texture(),
// 		hitCircleOverlaySprite: new Texture(),
// 		approachCircleSprite: new Texture()
// 	};
// };
// 	const [hitCircleSprite, hitCircleOverlaySprite, approachCircleSprite] = await Promise.all([
// 		Assets.load(getSkinAsset(skin, 'hitcircle.png')),
// 		Assets.load(getSkinAsset(skin, 'hitcircleoverlay.png')),
// 		Assets.load(getSkinAsset(skin, 'approachcircle.png'))
// 	]);
//
// 	console.log(hitCircleSprite);
//
// 	return {
// 		hitCircleSprite,
// 		hitCircleOverlaySprite,
// 		approachCircleSprite
// 	};
// };
