import { Assets, Texture } from 'pixi.js';
import { getSkinAsset } from './asset_urls';

export const textures = {
	hitcircle: new Texture(),
	hitcircleoverlay: new Texture(),
	approachcircle: new Texture(),
	cursor: new Texture(),
	'spinner-bottom': new Texture(),
	'spinner-middle': new Texture(),
	'spinner-top': new Texture(),
	'spinner-approachcircle': new Texture(),
	// Slider elements
	sliderb: new Texture(),
	sliderfollowcircle: new Texture(),
	reversearrow: new Texture(),
	sliderscorepoint: new Texture(),
	sliderstartcircle: new Texture(),
	sliderstartcircleoverlay: new Texture(),
	sliderendcircle: new Texture(),
	sliderendcircleoverlay: new Texture()
};

// Slider elements that fall back to hitcircle elements if not present
const sliderFallbacks: Record<string, keyof typeof textures> = {
	sliderstartcircle: 'hitcircle',
	sliderstartcircleoverlay: 'hitcircleoverlay',
	sliderendcircle: 'hitcircle',
	sliderendcircleoverlay: 'hitcircleoverlay'
};

export const updateSkinTextures = async (skin: string) => {
	const assetNames = Object.keys(textures) as (keyof typeof textures)[];

	await Promise.all(
		assetNames.map(async (assetName) => {
			let newTexture: Texture;
			try {
				newTexture = await Assets.load(getSkinAsset(skin, `${assetName}.png`));
			} catch {
				// Try fallback for slider elements
				const fallback = sliderFallbacks[assetName];
				if (fallback) {
					try {
						newTexture = await Assets.load(getSkinAsset(skin, `${fallback}.png`));
					} catch {
						newTexture = await Assets.load(getSkinAsset('default', `${fallback}.png`));
					}
				} else {
					newTexture = await Assets.load(getSkinAsset('default', `${assetName}.png`));
				}
			}

			textures[assetName].source = newTexture.source;
			textures[assetName].source.update();
			textures[assetName].update();
		})
	);
};
