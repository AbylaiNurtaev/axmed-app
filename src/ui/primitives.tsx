import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { ComponentProps, PropsWithChildren, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming
} from "react-native-reanimated";
import { axColors, axIcon, axMotion, axRadius, axSpace, axType } from "./tokens";
import { useAxReducedMotion, useAxTheme } from "./theme";

type IconName = ComponentProps<typeof Ionicons>["name"];
type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AxPressable({ children, onPress, disabled, style, accessibilityLabel, accessibilityRole = "button", accessibilityState, haptic = false, scale = 0.98 }: PropsWithChildren<{
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: { disabled?: boolean; selected?: boolean; checked?: boolean | "mixed"; busy?: boolean; expanded?: boolean };
  haptic?: boolean;
  scale?: number;
}>) {
  const progress = useSharedValue(0);
  const reduceMotion = useAxReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value * 0.14,
    transform: [{ scale: reduceMotion ? 1 : 1 - progress.value * (1 - scale) }]
  }));
  const setPressed = (pressed: boolean) => {
    progress.value = withTiming(pressed ? 1 : 0, { duration: reduceMotion ? 0 : axMotion.quick, easing: Easing.out(Easing.cubic) });
  };
  return <AnimatedPressable
    accessibilityRole={accessibilityRole}
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }}
    disabled={disabled}
    onPressIn={() => setPressed(true)}
    onPressOut={() => setPressed(false)}
    onPress={() => {
      if (haptic) void Haptics.selectionAsync();
      onPress?.();
    }}
    style={[style, animatedStyle, disabled && styles.disabled]}
  >{children}</AnimatedPressable>;
}

export function AxButton({ label, onPress, icon, variant = "primary", loading = false, disabled = false, compact = false, fullWidth = true, style }: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors: theme } = useAxTheme();
  const colors = buttonColors(variant, theme);
  return <AxPressable
    accessibilityLabel={label}
    accessibilityState={{ busy: loading, disabled: disabled || loading }}
    haptic
    disabled={disabled || loading}
    onPress={onPress}
    style={[styles.button, compact && styles.buttonCompact, fullWidth && styles.fullWidth, { backgroundColor: colors.background, borderColor: colors.border }, style]}
  >
    {loading ? <ActivityIndicator size="small" color={colors.foreground} /> : icon ? <Ionicons name={icon} size={axIcon.md} color={colors.foreground} /> : null}
    <Text maxFontSizeMultiplier={1.3} style={[styles.buttonText, { color: colors.foreground }]} numberOfLines={1}>{label}</Text>
  </AxPressable>;
}

export function AxIconButton({ icon, label, onPress, loading = false, tone = "green", disabled = false }: {
  icon: IconName;
  label: string;
  onPress: () => void;
  loading?: boolean;
  tone?: "green" | "neutral" | "danger";
  disabled?: boolean;
}) {
  const { colors: theme } = useAxTheme();
  const color = tone === "danger" ? theme.danger : tone === "neutral" ? theme.ink : theme.green;
  const background = tone === "danger" ? theme.dangerSoft : tone === "neutral" ? theme.surfaceMuted : theme.greenSoft;
  return <AxPressable accessibilityLabel={label} accessibilityState={{ busy: loading }} haptic onPress={onPress} disabled={disabled || loading} style={[styles.iconButton, { backgroundColor: background }]}>
    {loading ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={icon} size={axIcon.lg} color={color} />}
  </AxPressable>;
}

export function AxCard({ children, onPress, accessibilityLabel, tone = "default", style }: PropsWithChildren<{
  onPress?: () => void;
  accessibilityLabel?: string;
  tone?: "default" | "soft" | "accent";
  style?: StyleProp<ViewStyle>;
}>) {
  const { colors } = useAxTheme();
  const cardStyle = [styles.card, { backgroundColor: tone === "soft" ? colors.surfaceMuted : tone === "accent" ? colors.greenSoft : colors.surface, borderColor: tone === "accent" ? colors.green : colors.line }, style];
  if (!onPress) return <View style={cardStyle}>{children}</View>;
  return <AxPressable accessibilityLabel={accessibilityLabel} onPress={onPress} style={cardStyle}>{children}</AxPressable>;
}

export function AxBadge({ label, tone = "neutral", icon }: { label: string; tone?: "neutral" | "success" | "warning" | "danger" | "blue"; icon?: IconName }) {
  const { colors: theme } = useAxTheme();
  const colors = badgeColors(tone, theme);
  return <View style={[styles.badge, { backgroundColor: colors.background }]}>{icon ? <Ionicons name={icon} size={12} color={colors.foreground} /> : null}<Text maxFontSizeMultiplier={1.3} style={[styles.badgeText, { color: colors.foreground }]} numberOfLines={1}>{label}</Text></View>;
}

export function AxScreenHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const { colors } = useAxTheme();
  return <View style={styles.screenHeader}><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={[styles.screenTitle, { color: colors.ink }]}>{title}</Text>{subtitle ? <Text maxFontSizeMultiplier={1.3} style={[styles.screenSubtitle, { color: colors.muted }]}>{subtitle}</Text> : null}</View>{action}</View>;
}

export function AxSectionHeader({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  const { colors } = useAxTheme();
  return <View style={styles.sectionHeader}><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>{subtitle ? <Text maxFontSizeMultiplier={1.3} style={[styles.sectionSubtitle, { color: colors.muted }]}>{subtitle}</Text> : null}</View>{action && onAction ? <AxPressable accessibilityLabel={action} onPress={onAction} style={styles.sectionAction}><Text maxFontSizeMultiplier={1.3} style={[styles.sectionActionText, { color: colors.green }]}>{action}</Text><Ionicons name="chevron-forward" size={15} color={colors.green} /></AxPressable> : null}</View>;
}

export function AxFilterChip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: IconName }) {
  const { colors, dark } = useAxTheme();
  const selectedBackground = dark ? colors.green : colors.ink;
  return <AxPressable accessibilityLabel={label} accessibilityState={{ selected }} haptic onPress={onPress} style={[styles.chip, { backgroundColor: selected ? selectedBackground : colors.surfaceMuted, borderColor: selected ? selectedBackground : colors.line }]}>
    {icon ? <Ionicons name={icon} size={14} color={selected ? colors.white : colors.muted} /> : null}
    <Text maxFontSizeMultiplier={1.3} style={[styles.chipText, { color: selected ? colors.white : colors.muted }]}>{label}</Text>
  </AxPressable>;
}

export function AxSegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void }) {
  const [width, setWidth] = useState(0);
  const { colors } = useAxTheme();
  const indicator = useSharedValue(0);
  const reduceMotion = useAxReducedMotion();
  const index = Math.max(0, options.findIndex(option => option.value === value));
  const itemWidth = width > 0 ? (width - 8) / options.length : 0;
  useEffect(() => {
    const destination = index * itemWidth;
    indicator.value = reduceMotion ? destination : withSpring(destination, axMotion.spring);
  }, [index, indicator, itemWidth, reduceMotion]);
  const indicatorStyle = useAnimatedStyle(() => ({ width: itemWidth, transform: [{ translateX: indicator.value }] }));
  return <View style={[styles.segmented, { backgroundColor: colors.surfaceMuted }]} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
    {itemWidth > 0 ? <Animated.View pointerEvents="none" style={[styles.segmentIndicator, { backgroundColor: colors.surface }, indicatorStyle]} /> : null}
    {options.map(option => <AxPressable key={option.value} accessibilityLabel={option.label} accessibilityRole="tab" accessibilityState={{ selected: value === option.value }} haptic onPress={() => onChange(option.value)} style={styles.segment}><Text maxFontSizeMultiplier={1.3} style={[styles.segmentText, { color: value === option.value ? colors.ink : colors.muted }, value === option.value && styles.segmentTextActive]} numberOfLines={1}>{option.label}</Text></AxPressable>)}
  </View>;
}

export function AxMenuRow({ icon, title, subtitle, onPress, trailing, danger = false, disabled = false }: { icon: IconName; title: string; subtitle?: string; onPress: () => void; trailing?: ReactNode; danger?: boolean; disabled?: boolean }) {
  const { colors } = useAxTheme();
  const color = danger ? colors.danger : colors.green;
  return <AxPressable accessibilityLabel={title} disabled={disabled} onPress={onPress} style={styles.menuRow}>
    <View style={[styles.menuIcon, { backgroundColor: danger ? colors.dangerSoft : colors.greenSoft }]}><Ionicons name={icon} size={axIcon.md} color={color} /></View>
    <View style={styles.flex}><Text maxFontSizeMultiplier={1.3} style={[styles.menuTitle, { color: colors.ink }, danger && { color }]}>{title}</Text>{subtitle ? <Text maxFontSizeMultiplier={1.3} style={[styles.menuSubtitle, { color: colors.muted }]} numberOfLines={2}>{subtitle}</Text> : null}</View>
    {trailing}
    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
  </AxPressable>;
}

export function AxStatePanel({ icon, title, message, tone = "neutral", action, onAction, loading = false }: { icon: IconName; title: string; message: string; tone?: "neutral" | "error" | "success"; action?: string; onAction?: () => void; loading?: boolean }) {
  const { colors } = useAxTheme();
  const color = tone === "error" ? colors.danger : tone === "success" ? colors.green : colors.blue;
  const soft = tone === "error" ? colors.dangerSoft : tone === "success" ? colors.greenSoft : colors.blueSoft;
  return <View style={[styles.statePanel, { backgroundColor: colors.surface, borderColor: colors.line }]}><View style={[styles.stateIcon, { backgroundColor: soft }]}>{loading ? <ActivityIndicator color={color} /> : <Ionicons name={icon} size={26} color={color} />}</View><Text maxFontSizeMultiplier={1.3} style={[styles.stateTitle, { color: colors.ink }]}>{title}</Text><Text maxFontSizeMultiplier={1.3} style={[styles.stateMessage, { color: colors.muted }]}>{message}</Text>{action && onAction ? <AxButton compact fullWidth={false} label={action} onPress={onAction} variant={tone === "error" ? "danger" : "secondary"} /> : null}</View>;
}

export function AxAnimatedNumber({ value, format = (next) => Math.round(next).toLocaleString("ru-RU"), style }: { value: number; format?: (value: number) => string; style?: StyleProp<import("react-native").TextStyle> }) {
  const progress = useSharedValue(1);
  const reduceMotion = useAxReducedMotion();
  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: reduceMotion ? 0 : axMotion.slow, easing: Easing.out(Easing.cubic) });
  }, [progress, reduceMotion, value]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0, 1], [0.3, 1]), transform: [{ translateY: interpolate(progress.value, [0, 1], [4, 0]) }] }));
  return <Animated.Text maxFontSizeMultiplier={1.3} style={[style, animatedStyle]}>{format(value)}</Animated.Text>;
}

export function AxSkeleton({ width = "100%", height = 16, radius = axRadius.md }: { width?: number | `${number}%`; height?: number; radius?: number }) {
  const shimmer = useSharedValue(0);
  const { colors } = useAxTheme();
  const reduceMotion = useAxReducedMotion();
  useEffect(() => { shimmer.value = reduceMotion ? 0.5 : withRepeat(withTiming(1, { duration: 900 }), -1, true); }, [reduceMotion, shimmer]);
  const style = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(shimmer.value, [0, 1], [colors.line, colors.surfaceMuted]) }));
  return <Animated.View style={[{ width, height, borderRadius: radius }, style]} />;
}

function buttonColors(variant: ButtonVariant, colors: ReturnType<typeof useAxTheme>["colors"]) {
  return variant === "primary" ? { background: colors.green, foreground: colors.white, border: colors.green }
    : variant === "secondary" ? { background: colors.greenSoft, foreground: colors.green, border: colors.greenSoft }
    : variant === "outline" ? { background: colors.surface, foreground: colors.green, border: colors.green }
    : variant === "danger" ? { background: colors.danger, foreground: colors.white, border: colors.danger }
    : { background: "transparent", foreground: colors.green, border: "transparent" };
}
function badgeColors(tone: "neutral" | "success" | "warning" | "danger" | "blue", colors: ReturnType<typeof useAxTheme>["colors"]) {
  return tone === "success" ? { background: colors.greenSoft, foreground: colors.green }
    : tone === "warning" ? { background: colors.amberSoft, foreground: colors.amber }
    : tone === "danger" ? { background: colors.dangerSoft, foreground: colors.danger }
    : tone === "blue" ? { background: colors.blueSoft, foreground: colors.blue }
    : { background: colors.surfaceMuted, foreground: colors.muted };
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.45 },
  flex: { flex: 1, minWidth: 0 },
  fullWidth: { width: "100%" },
  button: { minHeight: 52, borderRadius: axRadius.md, borderWidth: 1, paddingHorizontal: axSpace.x4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: axSpace.x2 },
  buttonCompact: { minHeight: 42, paddingHorizontal: axSpace.x3 },
  buttonText: { ...axType.button },
  iconButton: { width: 48, height: 48, borderRadius: axRadius.md, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: axRadius.lg, padding: axSpace.x4, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line },
  cardSoft: { backgroundColor: axColors.surfaceMuted },
  cardAccent: { backgroundColor: axColors.greenSoft, borderColor: "#D4E8DD" },
  badge: { minHeight: 25, maxWidth: 140, paddingHorizontal: axSpace.x2, borderRadius: axRadius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  badgeText: { ...axType.label, fontSize: 9 },
  screenHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: axSpace.x3 },
  screenTitle: { ...axType.display, color: axColors.ink },
  screenSubtitle: { ...axType.body, color: axColors.muted, marginTop: 3 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: axSpace.x3, marginBottom: axSpace.x3 },
  sectionTitle: { ...axType.section, color: axColors.ink },
  sectionSubtitle: { ...axType.caption, color: axColors.muted, marginTop: 1 },
  sectionAction: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 2 },
  sectionActionText: { ...axType.caption, color: axColors.green, fontWeight: "800" },
  chip: { minHeight: 44, paddingHorizontal: axSpace.x3, borderRadius: axRadius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: axColors.surfaceMuted, borderWidth: 1, borderColor: axColors.line },
  chipSelected: { backgroundColor: axColors.ink, borderColor: axColors.ink },
  chipText: { ...axType.caption, color: axColors.muted, fontWeight: "700" },
  chipTextSelected: { color: axColors.white },
  segmented: { minHeight: 48, padding: 4, borderRadius: axRadius.md, flexDirection: "row", backgroundColor: "#E9ECE8" },
  segment: { flex: 1, minWidth: 0, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  segmentIndicator: { position: "absolute", left: 4, top: 4, bottom: 4, borderRadius: 13, backgroundColor: axColors.surface },
  segmentText: { ...axType.caption, color: axColors.muted, fontWeight: "700" },
  segmentTextActive: { color: axColors.ink, fontWeight: "800" },
  menuRow: { minHeight: 72, paddingHorizontal: axSpace.x3, flexDirection: "row", alignItems: "center", gap: axSpace.x3 },
  menuIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  menuTitle: { ...axType.bodyStrong, color: axColors.ink },
  menuSubtitle: { ...axType.caption, color: axColors.muted, marginTop: 2 },
  statePanel: { minHeight: 210, borderRadius: axRadius.xl, padding: axSpace.x5, backgroundColor: axColors.surface, borderWidth: 1, borderColor: axColors.line, alignItems: "center", justifyContent: "center" },
  stateIcon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  stateTitle: { ...axType.cardTitle, color: axColors.ink, marginTop: axSpace.x3, textAlign: "center" },
  stateMessage: { ...axType.caption, color: axColors.muted, marginTop: 5, marginBottom: axSpace.x3, maxWidth: 280, textAlign: "center" }
});
