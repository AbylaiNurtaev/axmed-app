import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { ComponentProps } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { axShadow, axSpace } from "./tokens";
import { axLightColors, useAxReducedMotion, useAxTheme } from "./theme";
import { useBlockTabSwipe } from "./SwipeTabs";

type IconName = ComponentProps<typeof Ionicons>["name"];
export type AxTabItem<T extends string> = { key: T; label: string; icon: IconName };
type Drag = { x: number; y: number; id: string; offset: number; candidate: number; claimed: boolean; cancelled: boolean };
const padding = 6;
const border = 1;
const snapSpring = { damping: 25, stiffness: 320, mass: 0.7, overshootClamping: true };
const selectionFeedback = () => { void Haptics.selectionAsync().catch(() => {}); };

export function FloatingTabBar<T extends string>({ items, active, onChange, forceLight = false }: { items: ReadonlyArray<AxTabItem<T>>; active: T; onChange: (value: T) => void; forceLight?: boolean }) {
  const [width, setWidth] = useState(0);
  const barRef = useRef<View>(null);
  const bounds = useRef({ left: 0, top: 0, height: 0, ready: false });
  const drag = useRef<Drag | null>(null);
  const blockTabSwipe = useBlockTabSwipe();
  const insets = useSafeAreaInsets();
  const theme = useAxTheme();
  const colors = forceLight ? axLightColors : theme.colors;
  const index = Math.max(0, items.findIndex(item => item.key === active));
  const translateX = useSharedValue(0);
  const reduceMotion = useAxReducedMotion();
  const cellWidth = width > 0 && items.length ? (width - 2 * (padding + border)) / items.length : 0;
  const latest = useRef({ items, onChange, index, cellWidth, reduceMotion, blockTabSwipe });
  latest.current = { items, onChange, index, cellWidth, reduceMotion, blockTabSwipe };

  useEffect(() => {
    drag.current = null;
    const next = index * cellWidth;
    translateX.value = reduceMotion ? next : withSpring(next, snapSpring);
  }, [cellWidth, index, reduceMotion, translateX]);
  useEffect(() => () => cancelAnimation(translateX), [translateX]);

  const responder = useMemo(() => {
    const snapTo = (target: number) => {
      const { cellWidth: cell, reduceMotion: reduced } = latest.current;
      translateX.value = reduced ? target * cell : withSpring(target * cell, snapSpring);
    };
    const update = (event: GestureResponderEvent) => {
      const current = drag.current;
      if (!current || current.cancelled || event.nativeEvent.identifier !== current.id) return;
      const { cellWidth: cell, items: tabs } = latest.current;
      const x = event.nativeEvent.pageX - bounds.current.left - border - padding - current.offset;
      const position = Math.max(0, Math.min((tabs.length - 1) * cell, x));
      // Follow the finger directly; only the release uses a spring.
      translateX.value = position;
      const candidate = Math.round(position / cell);
      if (candidate !== current.candidate) {
        current.candidate = candidate;
        selectionFeedback();
      }
    };
    const cancel = () => {
      drag.current = null;
      snapTo(latest.current.index);
    };
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: event => {
        latest.current.blockTabSwipe(event);
        if (drag.current?.claimed) {
          drag.current.cancelled = true;
          return false;
        }
        const { cellWidth: cell, index: selected } = latest.current;
        if (!bounds.current.ready || cell <= 0 || event.nativeEvent.touches.length !== 1) return false;
        const { pageX: x, pageY: y, identifier: id } = event.nativeEvent;
        const localX = x - bounds.current.left - border - padding;
        const offsetInSelected = localX - selected * cell;
        drag.current = {
          x, y, id, claimed: false, cancelled: false, candidate: selected,
          // Grabbing the current pill preserves the point where the finger holds it.
          offset: offsetInSelected >= 0 && offsetInSelected <= cell ? offsetInSelected : cell / 2
        };
        return false;
      },
      onMoveShouldSetPanResponderCapture: event => {
        const current = drag.current;
        if (!current || current.cancelled || event.nativeEvent.identifier !== current.id) return false;
        if (event.nativeEvent.touches.length !== 1) { current.cancelled = true; return false; }
        const dx = Math.abs(event.nativeEvent.pageX - current.x);
        const dy = Math.abs(event.nativeEvent.pageY - current.y);
        return dx > 4 && dx > dy;
      },
      onPanResponderGrant: event => {
        if (!drag.current) return;
        drag.current.claimed = true;
        cancelAnimation(translateX);
        selectionFeedback();
        update(event);
      },
      onPanResponderStart: event => {
        if (drag.current && event.nativeEvent.touches.length > 1) drag.current.cancelled = true;
      },
      onPanResponderMove: event => {
        if (drag.current && event.nativeEvent.touches.length > 1) drag.current.cancelled = true;
        update(event);
      },
      onPanResponderRelease: event => {
        const current = drag.current;
        const { top, height } = bounds.current;
        if (!current || current.cancelled || event.nativeEvent.pageY < top - 44 || event.nativeEvent.pageY > top + height + 44) { cancel(); return; }
        update(event);
        const next = current.candidate;
        drag.current = null;
        snapTo(next);
        const { items: tabs, index: selected, onChange: change } = latest.current;
        if (next !== selected && tabs[next]) change(tabs[next].key);
      },
      onPanResponderTerminate: cancel,
      onPanResponderTerminationRequest: () => false
    });
  }, [translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({ width: Math.max(0, cellWidth), transform: [{ translateX: translateX.value }] }));
  // A clipped copy keeps icons/text readable at every intermediate position of the pill.
  const selectedContentStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -translateX.value }] }));
  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
    barRef.current?.measureInWindow((left, top, _width, height) => {
      bounds.current = { left, top, height, ready: true };
    });
  };
  return <View ref={barRef} accessibilityRole="tablist" style={[styles.bar, { bottom: Math.max(8, insets.bottom), backgroundColor: colors.surface, borderColor: colors.line }]}
    onLayout={onLayout} {...responder.panHandlers} onTouchStart={blockTabSwipe}>
    {items.map(item => {
      const selected = item.key === active;
      return <Pressable
        key={item.key}
        accessibilityRole="tab"
        accessibilityLabel={item.label}
        accessibilityHint="Нажмите или проведите пальцем по панели, чтобы выбрать вкладку"
        accessibilityState={{ selected }}
        aria-selected={selected}
        onPress={() => {
          drag.current = null;
          if (!selected) { selectionFeedback(); onChange(item.key); }
        }}
        style={[styles.item, styles.tab]}
      ><TabContent item={item} color={colors.muted} /></Pressable>;
    })}
    {cellWidth > 0 ? <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
      style={[styles.indicator, { backgroundColor: colors.green }, indicatorStyle]}>
      <Animated.View style={[styles.selectedContent, { width: cellWidth * items.length }, selectedContentStyle]}>
        {items.map(item => <View key={item.key} style={[styles.item, { width: cellWidth, flexShrink: 0 }]}><TabContent item={item} color={colors.onAccent} /></View>)}
      </Animated.View>
    </Animated.View> : null}
  </View>;
}

function TabContent({ item, color }: { item: AxTabItem<string>; color: string }) {
  return <>
    <Ionicons name={item.icon} size={21} color={color} />
    <Text maxFontSizeMultiplier={1.3} style={[styles.label, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{item.label}</Text>
  </>;
}

const styles = StyleSheet.create({
  bar: { ...axShadow, position: "absolute", left: axSpace.x4, right: axSpace.x4, minHeight: 70, borderRadius: 29, borderWidth: border, flexDirection: "row", alignItems: "center", padding, overflow: "hidden" },
  indicator: { position: "absolute", left: padding, top: padding, bottom: padding, borderRadius: 22, overflow: "hidden" },
  selectedContent: { flexDirection: "row", height: "100%", alignItems: "center" },
  tab: { flex: 1 },
  item: { minWidth: 0, minHeight: 56, borderRadius: 22, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 2 },
  label: { fontSize: 9.5, lineHeight: 11, fontWeight: "700", textAlign: "center", width: "100%" }
});
