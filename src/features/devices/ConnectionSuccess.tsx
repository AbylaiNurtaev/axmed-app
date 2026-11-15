import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import Svg, { Path } from "react-native-svg";
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { useAxReducedMotion } from "../../ui/theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function ConnectionSuccess() {
  const reduceMotion = useAxReducedMotion();
  const scale = useSharedValue(reduceMotion ? 1 : 0.65);
  const stroke = useSharedValue(reduceMotion ? 0 : 74);
  useEffect(() => {
    scale.value = reduceMotion ? 1 : withSpring(1, { damping: 14, stiffness: 170 });
    stroke.value = reduceMotion ? 0 : withDelay(120, withTiming(0, { duration: 460 }));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [reduceMotion, scale, stroke]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: stroke.value }));
  return <View accessible accessibilityLabel="Устройство успешно подключено" accessibilityRole="image" style={styles.container}>
    <Animated.View style={[styles.badge, style]}>
      <Svg width={100} height={100} viewBox="0 0 100 100" aria-hidden accessibilityElementsHidden>
        <AnimatedPath d="M29 51 L43 65 L72 35" stroke="#24AD6A" strokeWidth={6} fill="none"
          strokeLinecap="round" strokeLinejoin="round" strokeDasharray="74 74" animatedProps={animatedProps} />
      </Svg>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  container: { alignItems: "center", marginVertical: 26 },
  badge: { width: 112, height: 112, borderRadius: 56, backgroundColor: "rgba(36, 173, 106, 0.12)", alignItems: "center", justifyContent: "center" }
});
