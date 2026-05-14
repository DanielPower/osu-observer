import { createContext, useContext } from "react";

type SetDynamicAccent = (color: string | null) => void;

export const DynamicAccentContext = createContext<SetDynamicAccent>(() => {});

export const useSetDynamicAccent = () => useContext(DynamicAccentContext);
