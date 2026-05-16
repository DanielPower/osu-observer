import { useEffect, useRef } from "react";
import { generateAccentVars } from "../lib/accentVars";

export function useDynamicAccent(bgColor: string): void {
  const themeEl = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!themeEl.current) {
      themeEl.current =
        (document.querySelector(".radix-themes") as HTMLElement | null) ??
        document.documentElement;
    }
    generateAccentVars(bgColor).forEach((value, key) => {
      themeEl.current!.style.setProperty(key, value);
    });
  }, [bgColor]);
}
