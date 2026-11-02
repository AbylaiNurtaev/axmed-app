import { useEffect, useState } from "react";
import { AppState } from "react-native";

export function secondsRemaining(deadline: number, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
export function countdownLabel(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function useSecondsRemaining(deadline: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    if (!deadline) return;
    const timer = setInterval(update, 1000);
    const subscription = AppState.addEventListener("change", update);
    return () => { clearInterval(timer); subscription.remove(); };
  }, [deadline]);
  return secondsRemaining(deadline, now);
}
