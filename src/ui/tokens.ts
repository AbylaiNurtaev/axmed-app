import { DynamicColorIOS, Platform } from "react-native";
import type { TextStyle, ViewStyle } from "react-native";

const adaptive = (light: string, dark: string) => Platform.OS === "ios"
  ? DynamicColorIOS({ light, dark }) as unknown as string
  : light;

export const axColors = {
  background: adaptive("#F5F6F2", "#101512"),
  surface: adaptive("#FFFFFF", "#171E1A"),
  surfaceMuted: adaptive("#F8F9F6", "#1D2521"),
  ink: adaptive("#131816", "#F2F6F3"),
  text: adaptive("#404843", "#CED7D1"),
  muted: adaptive("#7B837E", "#94A099"),
  line: adaptive("#E4E8E3", "#2B3630"),
  lineStrong: adaptive("#D6DDD8", "#3B4841"),
  green: adaptive("#237354", "#62C79D"),
  greenPressed: adaptive("#195E43", "#83D6B3"),
  greenSoft: adaptive("#E7F2EC", "#183428"),
  blue: adaptive("#4E83C4", "#78A8E0"),
  blueSoft: adaptive("#EDF3FA", "#192B3C"),
  coral: adaptive("#E66D52", "#F08C74"),
  coralSoft: adaptive("#FCEFEA", "#3B231E"),
  amber: adaptive("#E6A93D", "#F0BE61"),
  amberSoft: adaptive("#FBF3DF", "#382E1C"),
  purple: adaptive("#7167B8", "#9C91E2"),
  purpleSoft: adaptive("#F0EEFA", "#29253F"),
  danger: adaptive("#C95353", "#F08888"),
  dangerSoft: adaptive("#FCECEC", "#3B2020"),
  success: adaptive("#237354", "#62C79D"),
  white: "#FFFFFF",
  scrim: adaptive("rgba(14, 22, 18, 0.46)", "rgba(0, 0, 0, 0.66)")
} as const;

export const axSpace = { x1: 4, x2: 8, x3: 12, x4: 16, x5: 20, x6: 24, x7: 28, x8: 32, x10: 40 } as const;
export const axRadius = { sm: 12, md: 16, lg: 20, xl: 24, xxl: 28, pill: 999 } as const;
export const axIcon = { sm: 16, md: 20, lg: 24, xl: 28 } as const;

export const axType: Record<string, TextStyle> = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: "800", letterSpacing: -0.8 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -0.45 },
  section: { fontSize: 20, lineHeight: 26, fontWeight: "800", letterSpacing: -0.3 },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: "800" },
  body: { fontSize: 13, lineHeight: 19, fontWeight: "500" },
  bodyStrong: { fontSize: 13, lineHeight: 19, fontWeight: "700" },
  caption: { fontSize: 11, lineHeight: 16, fontWeight: "500" },
  label: { fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 0.45 },
  button: { fontSize: 14, lineHeight: 18, fontWeight: "800" }
};

export const axShadow: ViewStyle = {
  shadowColor: "#18231D",
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
