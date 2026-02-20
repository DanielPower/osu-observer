import { Assets, Texture } from "pixi.js";

export const textures = {
  // General elements
  cursor: null as Texture | null,

  // Hit circle elements
  hitcircle: null as Texture | null,
  hitcircleoverlay: null as Texture | null,
  approachcircle: null as Texture | null,

  // Spinner elements
  "spinner-bottom": null as Texture | null,
  "spinner-middle": null as Texture | null,
  "spinner-top": null as Texture | null,
  "spinner-approachcircle": null as Texture | null,

  // Slider elements
  sliderb: null as Texture | null,
  sliderfollowcircle: null as Texture | null,
  reversearrow: null as Texture | null,
  sliderscorepoint: null as Texture | null,
  sliderstartcircle: null as Texture | null,
  sliderstartcircleoverlay: null as Texture | null,
  sliderendcircle: null as Texture | null,
  sliderendcircleoverlay: null as Texture | null,

  // Hit result sprites
  hit0: null as Texture | null,
  hit50: null as Texture | null,
  hit100: null as Texture | null,
  hit300: null as Texture | null,
};

export type SkinTextureUrls = Partial<Record<keyof typeof textures, string>>;

const listeners = new Set<() => void>();

export const onTexturesChanged = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const updateSkinTextures = async (urls: SkinTextureUrls) => {
  const names = Object.keys(textures) as (keyof typeof textures)[];

  await Promise.all(
    names.map(async (name) => {
      const url = urls[name];
      if (url) {
        try {
          textures[name] = await Assets.load(url);
        } catch {
          textures[name] = null;
        }
      } else {
        textures[name] = null;
      }
    }),
  );

  for (const listener of listeners) listener();
};
