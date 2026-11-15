import { DynamicColorIOS, Platform } from "react-native";
import type { TextStyle, ViewStyle } from "react-native";
import { lightPalette, darkPalette, type AxThemeColors } from "./palette";

const adaptive = (light: string, dark: string) => Platform.OS === "ios" && light !== dark
  ? DynamicColorIOS({ light, dark }) as unknown as string
  : light;

export const axColors = Object.fromEntries(
  (Object.keys(lightPalette) as Array<keyof AxThemeColors>).map(key => [
    key, adaptive(lightPalette[key], darkPalette[key])
  ])
) as AxThemeColors;

export const axSpace = { x1: 4, x2: 8, x3: 12, x4: 16, x5: 20, x6: 24, x7: 28, x8: 32, x10: 40 } as const;
export const axRadius = { sm: 12, md: 16, lg: 20, xl: 24, xxl: 28, pill: 999 } as const;
export const axIcon = { sm: 16, md: 20, lg: 24, xl: 28 } as const;

export const axType: Record<string, TextStyle> = {
  display: { fontSize: 30, lineHeight: 38, fontWeight: "500", letterSpacing: -1.1 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "500", letterSpacing: -0.6 },
  section: { fontSize: 22, lineHeight: 28, fontWeight: "500", letterSpacing: -0.5 },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  body: { fontSize: 13, lineHeight: 19, fontWeight: "500" },
  bodyStrong: { fontSize: 13, lineHeight: 19, fontWeight: "700" },
  caption: { fontSize: 11, lineHeight: 16, fontWeight: "500" },
  label: { fontSize: 10, lineHeight: 14, fontWeight: "600", letterSpacing: 0.45 },
  button: { fontSize: 14, lineHeight: 18, fontWeight: "600" }
};

export const axShadow: ViewStyle = {
  shadowColor: "#111111",
  shadowOpacity: 0.07,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4
};

export const axMotion = {
  quick: 150,
  standard: 220,
  slow: 320,
  spring: { damping: 17, stiffness: 190, mass: 0.75 }
} as const;
