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

  // Score number elements
  "score-0": Texture | null;
  "score-1": Texture | null;
  "score-2": Texture | null;
  "score-3": Texture | null;
  "score-4": Texture | null;
  "score-5": Texture | null;
  "score-6": Texture | null;
  "score-7": Texture | null;
  "score-8": Texture | null;
  "score-9": Texture | null;
  "score-dot": Texture | null;
  "score-percent": Texture | null;
  "score-x": Texture | null;
};

export type SkinTextureUrls = Partial<Record<keyof SkinTextures, string>>;

export function createEmptyTextures(): SkinTextures {
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
    "score-0": null,
    "score-1": null,
    "score-2": null,
    "score-3": null,
    "score-4": null,
    "score-5": null,
    "score-6": null,
    "score-7": null,
    "score-8": null,
    "score-9": null,
    "score-dot": null,
    "score-percent": null,
    "score-x": null,
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
            this.textures[name] = await Assets.load({ src: url, format: "png", parser: "texture" });
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
