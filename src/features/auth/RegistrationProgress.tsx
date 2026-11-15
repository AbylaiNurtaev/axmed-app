import { createContext, useContext, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming,
  type SharedValue
} from "react-native-reanimated";
import { useAxReducedMotion, useAxStyles, type AxThemeColors } from "../../ui/theme";

// AuthFlow owns this value so the fill carries over when a step unmounts.
export const RegistrationProgressContext = createContext<SharedValue<number> | null>(null);

export function RegistrationProgress({ current, total, labelTotal }: {
  current: number; total: number; labelTotal: number;
}) {
  const { styles } = useAxStyles(createStyles);
  const sharedProgress = useContext(RegistrationProgressContext);
  const localProgress = useSharedValue(0);
  const progress = sharedProgress ?? localProgress;
  const reduceMotion = useAxReducedMotion();
  const steps = Math.max(1, total);
  const step = Math.max(0, Math.min(current, steps));
  const target = step / steps;
  const label = `Шаг ${current} из ${labelTotal}`;

  useEffect(() => {
    progress.value = reduceMotion ? target : withTiming(target, {
      duration: 560,
      easing: Easing.bezier(0.22, 1, 0.36, 1)
    });
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion, target]);

  return <View accessible accessibilityRole="progressbar" accessibilityLabel={label}
    accessibilityValue={{ min: 0, max: steps, now: step, text: label }} style={styles.progress}>
    <Text allowFontScaling style={styles.label}>{label}</Text>
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.segments}>
      {Array.from({ length: steps }, (_, index) => (
        <ProgressSegment key={index} index={index} total={steps} progress={progress} />
      ))}
    </View>
  </View>;
}

function ProgressSegment({ index, total, progress }: {
  index: number; total: number; progress: SharedValue<number>;
}) {
  const { styles } = useAxStyles(createStyles);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, progress.value * total - index)) * 100}%`
  }));
  return <View style={styles.track}><Animated.View style={[styles.fill, fillStyle]} /></View>;
}

const createStyles = (colors: AxThemeColors) => StyleSheet.create({
  progress: { flexDirection: "row", alignItems: "center", gap: 18, marginBottom: 26 },
  label: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  segments: { flex: 1, flexDirection: "row", gap: 6 },
  track: { flex: 1, height: 5, borderRadius: 999, backgroundColor: colors.line, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 999, backgroundColor: colors.ink }
});
