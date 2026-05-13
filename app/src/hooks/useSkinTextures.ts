import { useEffect } from "react";
import { updateSkinTextures } from "osu-renderer";

export function useSkinTextures(skin: string, mediaPath: string) {
  useEffect(() => {
    const base = `${mediaPath}/skins/${skin}`;
    updateSkinTextures({
      cursor: `${base}/cursor.png`,
      hitcircle: `${base}/hitcircle.png`,
      hitcircleoverlay: `${base}/hitcircleoverlay.png`,
      approachcircle: `${base}/approachcircle.png`,
      "spinner-bottom": `${base}/spinner-bottom.png`,
      "spinner-middle": `${base}/spinner-middle.png`,
      "spinner-top": `${base}/spinner-top.png`,
      "spinner-approachcircle": `${base}/spinner-approachcircle.png`,
      sliderb: `${base}/sliderb.png`,
      sliderfollowcircle: `${base}/sliderfollowcircle.png`,
      reversearrow: `${base}/reversearrow.png`,
      sliderscorepoint: `${base}/sliderscorepoint.png`,
      sliderstartcircle: `${base}/sliderstartcircle.png`,
      sliderstartcircleoverlay: `${base}/sliderstartcircleoverlay.png`,
      sliderendcircle: `${base}/sliderendcircle.png`,
      sliderendcircleoverlay: `${base}/sliderendcircleoverlay.png`,
      hit0: `${base}/hit0.png`,
      hit50: `${base}/hit50.png`,
      hit100: `${base}/hit100.png`,
      hit300: `${base}/hit300.png`,
    });
  }, [skin, mediaPath]);
}
