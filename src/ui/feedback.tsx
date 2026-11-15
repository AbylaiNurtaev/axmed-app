import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { AccessibilityInfo, findNodeHandle, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";
import { AxButton, AxIconButton } from "./primitives";
import { axColors, axMotion, axRadius, axSpace, axType } from "./tokens";
import { useAxReducedMotion, useAxTheme } from "./theme";

export function AxSnackbar({ visible, message, tone = "success", action, onAction, onDismiss }: { visible: boolean; message: string; tone?: "success" | "error" | "neutral"; action?: string; onAction?: () => void; onDismiss?: () => void }) {
  const { colors, dark } = useAxTheme();
  const reduceMotion = useAxReducedMotion();
  const [displayed, setDisplayed] = useState(visible);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (!visible) { setDisplayed(false); return; }
    setDisplayed(true);
    const timer = setTimeout(() => {
      setDisplayed(false);
      dismissRef.current?.();
    }, action ? 5000 : 3200);
    return () => clearTimeout(timer);
  }, [action, message, visible]);
  if (!displayed) return null;
  const color = colors.white;
  return <Animated.View entering={FadeIn.duration(reduceMotion ? 0 : axMotion.standard)} exiting={FadeOut.duration(reduceMotion ? 0 : axMotion.quick)} style={[styles.snackbar, { backgroundColor: dark ? "#303030" : colors.ink }]} accessibilityRole="alert" accessibilityLabel={message} accessibilityLiveRegion="polite">
    <View style={[styles.snackbarIcon, { backgroundColor: `${color}20` }]}><Ionicons name={tone === "error" ? "alert-circle-outline" : tone === "neutral" ? "information-circle-outline" : "checkmark-circle-outline"} size={19} color={color} /></View>
    <Text maxFontSizeMultiplier={1.3} style={[styles.snackbarText, { color: colors.white }]}>{message}</Text>
    {action && onAction ? <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} style={styles.snackbarActionHit}><Text maxFontSizeMultiplier={1.3} style={[styles.snackbarAction, { color }]}>{action}</Text></Pressable> : null}
  </Animated.View>;
}

export function AxBottomSheet({ visible, title, subtitle, onClose, children }: PropsWithChildren<{ visible: boolean; title: string; subtitle?: string; onClose: () => void }>) {
  const { colors } = useAxTheme();
  const reduceMotion = useAxReducedMotion();
  const titleRef = useRef<Text>(null);
  useEffect(() => {
    if (!visible || Platform.OS === "web") return;
    const timer = setTimeout(() => {
      const handle = findNodeHandle(titleRef.current);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }, reduceMotion ? 0 : axMotion.standard + 40);
    return () => clearTimeout(timer);
  }, [reduceMotion, visible]);
  return <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
    <View accessibilityViewIsModal style={styles.modalRoot}>
      <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(axMotion.standard)} exiting={reduceMotion ? undefined : FadeOut.duration(axMotion.quick)} style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View entering={reduceMotion ? undefined : SlideInDown.springify().damping(20).stiffness(190)} exiting={reduceMotion ? undefined : SlideOutDown.duration(axMotion.standard)} style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View style={[styles.handle, { backgroundColor: colors.lineStrong }]} />
        <View style={styles.sheetHeader}><View style={styles.flex}><Text maxFontSizeMultiplier={1.3} ref={titleRef} accessible accessibilityRole="header" style={[styles.sheetTitle, { color: colors.ink }]}>{title}</Text>{subtitle ? <Text maxFontSizeMultiplier={1.3} style={[styles.sheetSubtitle, { color: colors.muted }]}>{subtitle}</Text> : null}</View><AxIconButton icon="close" label="Закрыть" tone="neutral" onPress={onClose} /></View>
        {children}
      </Animated.View>
    </View>
  </Modal>;
}

export function AxConfirmSheet({ visible, title, message, confirmLabel, cancelLabel = "Отмена", danger = false, loading = false, onConfirm, onClose }: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return <AxBottomSheet visible={visible} title={title} subtitle={message} onClose={onClose}>
    <View style={styles.confirmActions}><AxButton label={cancelLabel} variant="secondary" onPress={onClose} disabled={loading} /><AxButton label={confirmLabel} variant={danger ? "danger" : "primary"} onPress={onConfirm} loading={loading} /></View>
  </AxBottomSheet>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  snackbar: { position: "absolute", left: axSpace.x4, right: axSpace.x4, bottom: 96, minHeight: 56, paddingHorizontal: axSpace.x3, borderRadius: axRadius.md, backgroundColor: axColors.ink, flexDirection: "row", alignItems: "center", gap: axSpace.x2, zIndex: 50 },
  snackbarIcon: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  snackbarText: { ...axType.caption, flex: 1, color: axColors.white, fontWeight: "700" },
  snackbarActionHit: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  snackbarAction: { ...axType.caption, fontWeight: "800" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: axColors.scrim },
  sheet: { maxHeight: "88%", paddingHorizontal: axSpace.x5, paddingTop: axSpace.x2, paddingBottom: axSpace.x8, borderTopLeftRadius: axRadius.xxl, borderTopRightRadius: axRadius.xxl, backgroundColor: axColors.background },
  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: axColors.lineStrong, marginBottom: axSpace.x4 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: axSpace.x3, marginBottom: axSpace.x5 },
  sheetTitle: { ...axType.title, color: axColors.ink },
  sheetSubtitle: { ...axType.body, color: axColors.muted, marginTop: 4 },
  confirmActions: { gap: axSpace.x2 }
});
