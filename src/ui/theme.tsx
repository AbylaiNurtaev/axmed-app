import { createContext, useContext, useEffect, useMemo } from "react";
import type { PropsWithChildren } from "react";
import { Appearance, useColorScheme } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

export type AxThemePreference = "light" | "dark" | "system";
export type AxTextSize = "small" | "standard" | "large";

const light = {
  background: "#F5F6F2", surface: "#FFFFFF", surfaceMuted: "#F8F9F6", ink: "#131816", text: "#404843",
  muted: "#7B837E", line: "#E4E8E3", lineStrong: "#D6DDD8", green: "#237354", greenPressed: "#195E43",
  greenSoft: "#E7F2EC", blue: "#4E83C4", blueSoft: "#EDF3FA", coral: "#E66D52", coralSoft: "#FCEFEA",
  amber: "#E6A93D", amberSoft: "#FBF3DF", purple: "#7167B8", purpleSoft: "#F0EEFA", danger: "#C95353",
  dangerSoft: "#FCECEC", success: "#237354", white: "#FFFFFF", scrim: "rgba(14, 22, 18, 0.46)"
} as const;

const dark = {
  background: "#101512", surface: "#171E1A", surfaceMuted: "#1D2521", ink: "#F2F6F3", text: "#CED7D1",
  muted: "#94A099", line: "#2B3630", lineStrong: "#3B4841", green: "#62C79D", greenPressed: "#83D6B3",
  greenSoft: "#183428", blue: "#78A8E0", blueSoft: "#192B3C", coral: "#F08C74", coralSoft: "#3B231E",
  amber: "#F0BE61", amberSoft: "#382E1C", purple: "#9C91E2", purpleSoft: "#29253F", danger: "#F08888",
  dangerSoft: "#3B2020", success: "#62C79D", white: "#FFFFFF", scrim: "rgba(0, 0, 0, 0.66)"
} as const;

export type AxThemeColors = { [Key in keyof typeof light]: string };
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
    const colors: AxThemeColors = highContrast ? { ...base, line: base.lineStrong, muted: isDark ? "#B8C4BD" : "#5E6862" } : base;
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
export function useAxReducedMotion() {
  const systemPreference = useReducedMotion();
  const { reduceMotion } = useAxTheme();
  return Boolean(systemPreference || reduceMotion);
}
export const axLightColors = light;
export const axDarkColors = dark;
