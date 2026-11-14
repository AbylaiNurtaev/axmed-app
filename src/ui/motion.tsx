import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { FadeInDown, FadeOutUp, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { axMotion } from "./tokens";
import { useAxReducedMotion } from "./theme";

export function AxReveal({ children, delay = 0, distance = 10, style }: PropsWithChildren<{ delay?: number; distance?: number; style?: StyleProp<ViewStyle> }>) {
  const reduceMotion = useAxReducedMotion();
  const entering = reduceMotion
    ? undefined
    : FadeInDown.duration(axMotion.standard).delay(delay).springify().damping(19).stiffness(180).withInitialValues({ transform: [{ translateY: distance }], opacity: 0 }).reduceMotion(ReduceMotion.System);
  return <Animated.View entering={entering} style={style}>{children}</Animated.View>;
}

export function AxCollapsible({ visible, children, style }: PropsWithChildren<{ visible: boolean; style?: StyleProp<ViewStyle> }>) {
  const reduceMotion = useAxReducedMotion();
  if (!visible) return null;
  return <Animated.View
    entering={reduceMotion ? undefined : FadeInDown.duration(axMotion.standard).reduceMotion(ReduceMotion.System)}
    exiting={reduceMotion ? undefined : FadeOutUp.duration(axMotion.quick).reduceMotion(ReduceMotion.System)}
    layout={reduceMotion ? undefined : LinearTransition.duration(axMotion.standard).reduceMotion(ReduceMotion.System)}
    style={style}
  >{children}</Animated.View>;
}

export { Animated };
