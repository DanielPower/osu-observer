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
	'spinner-approachcircle': new Texture()
};

export const updateSkinTextures = async (skin: string) => {
	const assetNames = Object.keys(textures) as (keyof typeof textures)[];

	await Promise.all(
		assetNames.map(async (assetName) => {
			let newTexture: Texture;
			try {
				newTexture = await Assets.load(getSkinAsset(skin, `${assetName}.png`));
			} catch (_error) {
				newTexture = await Assets.load(getSkinAsset('default', `${assetName}.png`));
			}

			textures[assetName].source = newTexture.source;
			textures[assetName].source.update();
			textures[assetName].update();
		})
	);
};
