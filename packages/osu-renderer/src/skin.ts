import { Assets, Texture } from "pixi.js";

export type SkinTextures = {
  // General elements
  cursor: Texture | null;

  // Hit circle elements
  hitcircle: Texture | null;
  hitcircleoverlay: Texture | null;
  approachcircle: Texture | null;

  // Spinner elements
  "spinner-bottom": Texture | null;
  "spinner-middle": Texture | null;
  "spinner-top": Texture | null;
  "spinner-approachcircle": Texture | null;

  // Slider elements
  sliderb: Texture | null;
  sliderfollowcircle: Texture | null;
  reversearrow: Texture | null;
  sliderscorepoint: Texture | null;
  sliderstartcircle: Texture | null;
  sliderstartcircleoverlay: Texture | null;
  sliderendcircle: Texture | null;
  sliderendcircleoverlay: Texture | null;

  // Hit result sprites
  hit0: Texture | null;
  hit50: Texture | null;
  hit100: Texture | null;
  hit300: Texture | null;
};

export type SkinTextureUrls = Partial<Record<keyof SkinTextures, string>>;

function createEmptyTextures(): SkinTextures {
  return {
    cursor: null,
    hitcircle: null,
    hitcircleoverlay: null,
    approachcircle: null,
    "spinner-bottom": null,
    "spinner-middle": null,
    "spinner-top": null,
    "spinner-approachcircle": null,
    sliderb: null,
    sliderfollowcircle: null,
    reversearrow: null,
    sliderscorepoint: null,
    sliderstartcircle: null,
    sliderstartcircleoverlay: null,
    sliderendcircle: null,
    sliderendcircleoverlay: null,
    hit0: null,
    hit50: null,
    hit100: null,
    hit300: null,
  };
}

export class Skin {
  textures: SkinTextures = createEmptyTextures();
  private listeners = new Set<() => void>();

  onChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async update(urls: SkinTextureUrls): Promise<void> {
    const names = Object.keys(this.textures) as (keyof SkinTextures)[];

    await Promise.all(
      names.map(async (name) => {
        const url = urls[name];
        if (url) {
          try {
            this.textures[name] = await Assets.load(url);
          } catch {
            this.textures[name] = null;
          }
        } else {
          this.textures[name] = null;
        }
      }),
    );

    for (const listener of this.listeners) listener();
  }
}

// Default global instance for backward compatibility
export const defaultSkin = new Skin();

export const updateSkinTextures = (urls: SkinTextureUrls) => defaultSkin.update(urls);
