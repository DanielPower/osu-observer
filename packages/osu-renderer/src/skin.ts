import { Assets, Texture } from "pixi.js";

export const textures = {
  // General elements
  cursor: new Texture(),

  // Hit circle elements
  hitcircle: new Texture(),
  hitcircleoverlay: new Texture(),
  approachcircle: new Texture(),

  // Spinner elements
  "spinner-bottom": new Texture(),
  "spinner-middle": new Texture(),
  "spinner-top": new Texture(),
  "spinner-approachcircle": new Texture(),

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
  hit300: new Texture(),
};

export type SkinTextureUrls = Record<keyof typeof textures, string>;

export const updateSkinTextures = async (urls: SkinTextureUrls) => {
  const entries = Object.entries(urls) as [keyof typeof textures, string][];

  await Promise.all(
    entries.map(async ([name, url]) => {
      const newTexture = await Assets.load(url);
      textures[name].source = newTexture.source;
      textures[name].source.update();
      textures[name].update();
    }),
  );
};
