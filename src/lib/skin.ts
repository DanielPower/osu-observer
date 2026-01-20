import { Assets, Texture } from 'pixi.js';
import { getSkinAsset } from './asset_urls';

export const textures = {
	// General elements
	cursor: new Texture(),

	// Hit circle elements
	hitcircle: new Texture(),
	hitcircleoverlay: new Texture(),
	approachcircle: new Texture(),

	// Spinner elements
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
	sliderendcircleoverlay: new Texture(),

	// Hit result sprites
	hit0: new Texture(),
	hit50: new Texture(),
	hit100: new Texture(),
	hit300: new Texture()
};

export const updateSkinTextures = async (skin: string) => {
	const assetNames = Object.keys(textures) as (keyof typeof textures)[];

	await Promise.all(
		assetNames.map(async (assetName) => {
			const newTexture = await Assets.load(getSkinAsset(skin, `${assetName}.png`));
			textures[assetName].source = newTexture.source;
			textures[assetName].source.update();
			textures[assetName].update();
		})
	);
};
