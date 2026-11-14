import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { axColors, axMotion, axShadow, axSpace } from "./tokens";
import { axLightColors, useAxReducedMotion, useAxTheme } from "./theme";

type IconName = ComponentProps<typeof Ionicons>["name"];
export type AxTabItem<T extends string> = { key: T; label: string; icon: IconName };

export function FloatingTabBar<T extends string>({ items, active, onChange, forceLight = false }: { items: ReadonlyArray<AxTabItem<T>>; active: T; onChange: (value: T) => void; forceLight?: boolean }) {
  const [width, setWidth] = useState(0);
  const theme = useAxTheme();
  const colors = forceLight
    ? { ...axLightColors, green: "#111111", muted: "#6B6B6B", line: "#E3E3E3" }
    : theme.colors;
  const index = Math.max(0, items.findIndex(item => item.key === active));
  const translateX = useSharedValue(0);
  const reduceMotion = useAxReducedMotion();
  const cellWidth = width > 0 ? (width - axSpace.x3) / items.length : 0;
  useEffect(() => {
    const next = index * cellWidth;
    translateX.value = reduceMotion ? next : withSpring(next, axMotion.spring);
  }, [cellWidth, index, reduceMotion, translateX]);
  const indicatorStyle = useAnimatedStyle(() => ({ width: Math.max(0, cellWidth), transform: [{ translateX: translateX.value }] }));
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return <View accessibilityRole="tablist" style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.line }]} onLayout={onLayout}>
    {cellWidth > 0 ? <Animated.View pointerEvents="none" style={[styles.indicator, { backgroundColor: colors.green }, indicatorStyle]} /> : null}
    {items.map(item => {
      const selected = item.key === active;
      return <Pressable
        key={item.key}
        accessibilityRole="tab"
        accessibilityLabel={item.label}
        accessibilityState={{ selected }}
        onPress={() => {
          void Haptics.selectionAsync();
          onChange(item.key);
        }}
        style={({ pressed }) => [styles.item, pressed && styles.pressed]}
      >
        <Ionicons name={item.icon} size={21} color={selected ? colors.white : colors.muted} />
        <Text maxFontSizeMultiplier={1.3} style={[styles.label, { color: selected ? colors.white : colors.muted }, selected && styles.labelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{item.label}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  bar: { ...axShadow, position: "absolute", left: axSpace.x4, right: axSpace.x4, bottom: Platform.OS === "ios" ? 11 : 14, minHeight: 70, borderRadius: 29, borderWidth: 1, borderColor: axColors.line, backgroundColor: axColors.surface, flexDirection: "row", alignItems: "center", padding: 6, overflow: "hidden" },
  indicator: { position: "absolute", left: 6, top: 6, bottom: 6, borderRadius: 22, backgroundColor: axColors.green },
  item: { flex: 1, minWidth: 0, minHeight: 56, borderRadius: 22, zIndex: 2, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 2 },
  pressed: { opacity: 0.72 },
  label: { color: "#68746E", fontSize: 9.5, lineHeight: 11, fontWeight: "700", textAlign: "center", width: "100%" },
  labelActive: { color: axColors.white }
});
