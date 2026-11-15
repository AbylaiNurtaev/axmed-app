// Shared monochrome palette. Legacy tone names remain compatible with existing
// components and saved preferences; every tone is an achromatic colour.
export const lightPalette = {
  background: "#F7F7F7", surface: "#FFFFFF", surfaceMuted: "#EFEFEF",
  ink: "#111111", text: "#404040", muted: "#6B6B6B",
  line: "#E3E3E3", lineStrong: "#CCCCCC",
  green: "#111111", greenPressed: "#303030", greenSoft: "#EFEFEF",
  blue: "#444444", blueSoft: "#F0F0F0",
  coral: "#555555", coralSoft: "#F2F2F2",
  amber: "#666666", amberSoft: "#EEEEEE",
  purple: "#333333", purpleSoft: "#EBEBEB",
  danger: "#111111", dangerSoft: "#E8E8E8", success: "#111111",
  white: "#FFFFFF", onAccent: "#FFFFFF", scrim: "rgba(0, 0, 0, 0.46)"
} as const;

export type AxThemeColors = { [Key in keyof typeof lightPalette]: string };

export const darkPalette: AxThemeColors = {
  background: "#111111", surface: "#1B1B1B", surfaceMuted: "#262626",
  ink: "#F5F5F5", text: "#D0D0D0", muted: "#AAAAAA",
  line: "#363636", lineStrong: "#505050",
  green: "#F5F5F5", greenPressed: "#DDDDDD", greenSoft: "#292929",
  blue: "#D8D8D8", blueSoft: "#252525",
  coral: "#C8C8C8", coralSoft: "#282828",
  amber: "#B8B8B8", amberSoft: "#2A2A2A",
  purple: "#E2E2E2", purpleSoft: "#272727",
  danger: "#F5F5F5", dangerSoft: "#303030", success: "#F5F5F5",
  white: "#FFFFFF", onAccent: "#111111", scrim: "rgba(0, 0, 0, 0.66)"
};
