import { createContext, useContext } from "react";

type SetAccentColor = (hex: string | null) => void;

export const AccentColorContext = createContext<SetAccentColor>(() => {});

export const useSetAccentColor = () => useContext(AccentColorContext);
