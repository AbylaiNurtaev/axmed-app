import { useEffect, useMemo, useRef } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useAxTheme } from "../../ui/theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const LINE_COUNT = 19;
const KEYFRAME_COUNT = 24;
const SEGMENT_COUNT = 8;
const inputRange = Array.from({ length: KEYFRAME_COUNT + 1 }, (_, index) => index / KEYFRAME_COUNT);

// Smooth, open ribbons rather than a ring. Every frame uses the same path commands,
// allowing Animated to interpolate the curves without a new React render per frame.
function ribbonPath(line: number, phase: number) {
  const offset = (line / (LINE_COUNT - 1)) * 2 - 1;
  const point = (t: number) => {
    const envelope = Math.sin(Math.PI * t);
    const envelopeSlope = Math.PI * Math.cos(Math.PI * t);
    const wave = 2 * Math.PI * t - phase;
    const twist = 2 * Math.PI * t + phase;
    return {
      x: 28 + 304 * t,
      y: 155 - 58 * Math.sin(wave) * envelope + offset * 68 * envelope * Math.cos(twist),
      slope: -58 * (2 * Math.PI * Math.cos(wave) * envelope + Math.sin(wave) * envelopeSlope)
        + offset * 68 * (envelopeSlope * Math.cos(twist) - 2 * Math.PI * envelope * Math.sin(twist))
    };
  };
  const coordinate = (value: number) => value.toFixed(2);
  let previous = point(0);
  let path = `M ${coordinate(previous.x)} ${coordinate(previous.y)}`;
  const step = 1 / (SEGMENT_COUNT * 3);
  for (let segment = 1; segment <= SEGMENT_COUNT; segment++) {
    const next = point(segment / SEGMENT_COUNT);
    path += ` C ${coordinate(previous.x + 304 * step)} ${coordinate(previous.y + previous.slope * step)}`
      + ` ${coordinate(next.x - 304 * step)} ${coordinate(next.y - next.slope * step)}`
      + ` ${coordinate(next.x)} ${coordinate(next.y)}`;
    previous = next;
  }
  return path;
}

// Compute geometry once. The last pose is exactly the first, so the loop has no jump.
const ribbons = Array.from({ length: LINE_COUNT }, (_, line) => ({
  opacity: 0.24 + 0.55 * (1 - Math.abs((line / (LINE_COUNT - 1)) * 2 - 1)),
  frames: inputRange.map((progress, frame) => ribbonPath(line, frame === KEYFRAME_COUNT ? 0 : progress * Math.PI * 2))
}));

export function WelcomeMotion({ height }: { height: number }) {
  const { colors } = useAxTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const paths = useMemo(() => ribbons.map(({ frames }) => progress.interpolate({
    inputRange,
    outputRange: frames
  })), [progress]);

  useEffect(() => {
    let disposed = false;
    let preferenceChanged = false;
    let reduceMotion = true;
    let foreground = AppState.currentState !== "background" && AppState.currentState !== "inactive";
    let animation: Animated.CompositeAnimation | undefined;

    const updatePlayback = () => {
      animation?.stop();
      animation = undefined;
      if (reduceMotion || !foreground) return;
      progress.setValue(0);
      animation = Animated.loop(Animated.timing(progress, {
        toValue: 1,
        duration: 12000,
        easing: Easing.linear,
        // SVG path geometry cannot use the native transform/opacity driver.
        useNativeDriver: false,
        isInteraction: false
      }));
      animation.start();
    };

    const motionSubscription = AccessibilityInfo.addEventListener("reduceMotionChanged", enabled => {
      preferenceChanged = true;
      reduceMotion = enabled;
      updatePlayback();
    });
    const stateSubscription = AppState.addEventListener("change", state => {
      const nextForeground = state === "active";
      if (foreground === nextForeground) return;
      foreground = nextForeground;
      updatePlayback();
    });
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (disposed || preferenceChanged) return;
      reduceMotion = enabled;
      updatePlayback();
    }).catch(() => {
      // Keep the illustration still if the motion preference is unavailable.
    });

    return () => {
      disposed = true;
      animation?.stop();
      motionSubscription?.remove();
      stateSubscription.remove();
    };
  }, [progress]);

  return (
    <View testID="welcome-motion" accessible={false} accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.container}>
      <Svg width="100%" height={height} viewBox="0 0 360 310">
        {paths.map((path, index) => (
          <AnimatedPath key={index} d={path} fill="none" stroke={colors.ink} strokeWidth={1.15}
            strokeOpacity={ribbons[index].opacity} strokeLinecap="round" />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", maxWidth: 360 }
});
