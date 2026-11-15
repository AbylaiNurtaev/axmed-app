import { useMemo } from "react";
import { useAxTheme, type AxThemeColors } from "../../ui/theme";
import { axColors } from "../../ui/tokens";

function authPalette(colors: AxThemeColors) {
  return {
    ...colors,
    soft: colors.surfaceMuted,
    border: colors.line,
    accent: colors.text,
    greenDark: colors.green,
    greenLight: colors.blue
  };
}

export type AuthColors = ReturnType<typeof authPalette>;
// Compatibility for device components that still use native adaptive tokens.
export const authColors = authPalette(axColors);

export function useAuthStyles<T>(createStyles: (colors: AuthColors) => T) {
  const { colors, dark } = useAxTheme();
  const themed = useMemo(() => {
    const authColors = authPalette(colors);
    return { styles: createStyles(authColors), authColors, colors: authColors };
  }, [colors, createStyles]);
  return { ...themed, dark };
}
