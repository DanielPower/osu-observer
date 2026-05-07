import { createContext, useContext } from "react";

type SetBackgroundUrl = (url: string | null) => void;

export const DynamicAccentContext = createContext<SetBackgroundUrl>(() => {});

export const useSetDynamicAccent = () => useContext(DynamicAccentContext);
