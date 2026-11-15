import { createContext, useContext, useEffect, useMemo } from "react";
import type { PropsWithChildren } from "react";
import { Appearance, useColorScheme } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { lightPalette as light, darkPalette as dark, type AxThemeColors } from "./palette";
export type { AxThemeColors } from "./palette";

export type AxThemePreference = "light" | "dark" | "system";
export type AxTextSize = "small" | "standard" | "large";

type ThemeContextValue = {
  preference: AxThemePreference;
  dark: boolean;
  colors: AxThemeColors;
  textScale: number;
  reduceMotion: boolean;
  highContrast: boolean;
};

const fallback: ThemeContextValue = { preference: "light", dark: false, colors: light, textScale: 1, reduceMotion: false, highContrast: false };
const ThemeContext = createContext<ThemeContextValue>(fallback);

export function AxThemeProvider({ preference, textSize = "standard", reduceMotion = false, highContrast = false, children }: PropsWithChildren<{
  preference: AxThemePreference;
  textSize?: AxTextSize;
  reduceMotion?: boolean;
  highContrast?: boolean;
}>) {
  useEffect(() => {
    if (typeof Appearance.setColorScheme !== "function") return;
    const setScheme = Appearance.setColorScheme as (scheme: "light" | "dark" | null) => void;
    setScheme(preference === "system" ? null : preference);
    return () => setScheme(null);
  }, [preference]);
  const system = useColorScheme();
  const isDark = preference === "system" ? system === "dark" : preference === "dark";
  const value = useMemo<ThemeContextValue>(() => {
    const base = isDark ? dark : light;
    const colors: AxThemeColors = highContrast ? { ...base, line: base.lineStrong, muted: isDark ? "#C0C0C0" : "#686868" } : base;
    return {
    preference,
    dark: isDark,
    colors,
    textScale: textSize === "large" ? 1.12 : textSize === "small" ? 0.94 : 1,
    reduceMotion,
    highContrast
  }; }, [highContrast, isDark, preference, reduceMotion, textSize]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAxTheme() { return useContext(ThemeContext); }
export function useAxStyles<T>(createStyles: (colors: AxThemeColors) => T) {
  const theme = useAxTheme();
  const styles = useMemo(() => createStyles(theme.colors), [createStyles, theme.colors]);
  return { ...theme, styles };
}
export function useAxReducedMotion() {
  const systemPreference = useReducedMotion();
  const { reduceMotion } = useAxTheme();
  return Boolean(systemPreference || reduceMotion);
}
export const axLightColors = light;
export const axDarkColors = dark;
