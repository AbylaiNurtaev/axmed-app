import * as Haptics from "expo-haptics";
import { createContext, forwardRef, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import { PanResponder, ScrollView, View, type GestureResponderEvent, type ScrollViewProps, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

const BlockTabSwipe = createContext<(event: GestureResponderEvent) => void>(() => {});

export function useBlockTabSwipe() { return useContext(BlockTabSwipe); }

export function SwipeTabs({ activeIndex, count, onChange, enabled = true, children, style }: {
  activeIndex: number;
  count: number;
  onChange: (index: number) => void;
  enabled?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const current = useRef({ activeIndex, count, onChange, enabled });
  current.current = { activeIndex, count, onChange, enabled };
  const blocked = useRef(false);
  const blockedAt = useRef<number | null>(null);
  const origin = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0, id: "" });
  // A nested horizontal control owns the whole gesture, even after the finger leaves it.
  const blockSwipe = useCallback((event: GestureResponderEvent) => {
    blockedAt.current = event.timeStamp;
    blocked.current = true;
  }, []);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: (event, gesture) => {
      start.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, id: event.nativeEvent.identifier };
      // On web a child's touch-start can run before the responder capture callback.
      blocked.current = blockedAt.current === event.timeStamp || gesture.numberActiveTouches > 1;
      origin.current = null;
      return false;
    },
    onMoveShouldSetPanResponderCapture: (event, gesture) => {
      if (event.nativeEvent.identifier !== start.current.id) return false;
      const { enabled: canSwipe, activeIndex: index, count: total } = current.current;
      const movement = event.nativeEvent.pageX - start.current.x;
      const dx = Math.abs(movement);
      const dy = Math.abs(event.nativeEvent.pageY - start.current.y);
      if (gesture.numberActiveTouches > 1 || (dy > 12 && dy > dx * 1.1)) blocked.current = true;
      if (!canSwipe || blocked.current || dx < 20 || dx < dy * 1.6) return false;
      const next = index + (movement < 0 ? 1 : -1);
      return next >= 0 && next < total;
    },
    onPanResponderGrant: () => { origin.current = current.current.activeIndex; },
    onPanResponderStart: (_, gesture) => {
      if (gesture.numberActiveTouches > 1) blocked.current = true;
    },
    onPanResponderMove: (_, gesture) => {
      if (gesture.numberActiveTouches > 1) blocked.current = true;
    },
    onPanResponderRelease: (event, gesture) => {
      if (event.nativeEvent.identifier !== start.current.id) return;
      const { enabled: canSwipe, activeIndex: index, count: total, onChange: change } = current.current;
      const movement = event.nativeEvent.pageX - start.current.x;
      const dx = Math.abs(movement);
      const dy = Math.abs(event.nativeEvent.pageY - start.current.y);
      const fastSwipe = dx >= 28 && Math.abs(gesture.vx) >= 0.45 && movement * gesture.vx > 0;
      if (!canSwipe || blocked.current || origin.current !== index || dx < dy * 1.6 || (dx < 56 && !fastSwipe)) return;
      const next = index + (movement < 0 ? 1 : -1);
      if (next < 0 || next >= total) return;
      void Haptics.selectionAsync().catch(() => {});
      change(next);
    },
    onPanResponderTerminate: () => { origin.current = null; },
    onPanResponderTerminationRequest: () => true
  }), []);

  return <BlockTabSwipe.Provider value={blockSwipe}>
    <View style={style} {...responder.panHandlers}>{children}</View>
  </BlockTabSwipe.Provider>;
}

/** Keeps a chart's own drag interaction without changing its layout or touch callbacks. */
export function TabSwipeGuard({ onStartShouldSetResponderCapture, onTouchStart, ...props }: ViewProps) {
  const blockSwipe = useContext(BlockTabSwipe);
  return <View {...props} onStartShouldSetResponderCapture={event => {
    blockSwipe(event);
    return onStartShouldSetResponderCapture?.(event) ?? false;
  }} onTouchStart={event => {
    blockSwipe(event);
    onTouchStart?.(event);
  }} />;
}

/** Native ScrollView handles responder capture internally, so lock on touch start. */
export const TabSwipeScrollView = forwardRef<ScrollView, ScrollViewProps>(function TabSwipeScrollView({ horizontal, onTouchStart, ...props }, ref) {
  const blockSwipe = useContext(BlockTabSwipe);
  return <ScrollView {...props} ref={ref} horizontal={horizontal} onTouchStart={event => {
    if (horizontal) blockSwipe(event);
    onTouchStart?.(event);
  }} />;
});
