import type { DeviceReading, DeviceSyncBatch, Metric } from "./types";

export function dateInZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (name: string) => parts.find(item => item.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function readingSummary(batch: DeviceSyncBatch, now = new Date(), selectedDay?: string) {
  const today = selectedDay ?? dateInZone(now, batch.timeZone);
  const unique = new Map(batch.samples.map(sample => [`${sample.metric}:${sample.sourceRecordId}`, sample]));
  const latest: Partial<Record<Metric, DeviceReading>> = {};
  const totals: Partial<Record<Metric, number>> = {};
  const sleepByDay = new Map<string, Partial<Record<Metric, number>>>();
  const pressures = new Map<string, { high?: DeviceReading; low?: DeviceReading }>();
  const days = new Set<string>();
  for (const sample of unique.values()) {
    days.add(sample.localDate);
    if (selectedDay && sample.localDate !== selectedDay) continue;
    const previous = latest[sample.metric];
    if (!previous || sample.recordedAt > previous.recordedAt ||
      (sample.recordedAt === previous.recordedAt && sample.origin === "manual")) latest[sample.metric] = sample;
    if (sample.localDate === today && ["steps", "distance", "activeCalories"].includes(sample.metric)) {
      totals[sample.metric] = (totals[sample.metric] ?? 0) + sample.value;
    }
    if (sample.metric.startsWith("sleep")) {
      const sum = sleepByDay.get(sample.localDate) ?? {};
      sum[sample.metric] = (sum[sample.metric] ?? 0) + sample.value;
      sleepByDay.set(sample.localDate, sum);
    }
    if (sample.metric === "bloodPressureSystolic" || sample.metric === "bloodPressureDiastolic") {
      // Pair ONLY fields from the same vendor record AND time, never two latest values.
      const key = sample.sourceRecordId.replace(/^bloodPressure(Systolic|Diastolic):/, "") + "|" + sample.recordedAt;
      const pair = pressures.get(key) ?? {};
      if (sample.metric === "bloodPressureSystolic") pair.high = sample; else pair.low = sample;
      pressures.set(key, pair);
    }
  }
  const sleepDay = [...sleepByDay.keys()].filter(day => sleepByDay.get(day)?.sleepDuration !== undefined).sort().at(-1);
  let bloodPressure: { high: DeviceReading; low: DeviceReading } | undefined;
  for (const pair of pressures.values()) {
    if (pair.high && pair.low && pair.high.value > pair.low.value &&
      (!bloodPressure || pair.high.recordedAt > bloodPressure.high.recordedAt)) {
      bloodPressure = { high: pair.high, low: pair.low };
    }
  }
  return {
    steps: totals.steps, distance: totals.distance, activeCalories: totals.activeCalories,
    heartRate: latest.heartRate, sleepMinutes: sleepDay ? sleepByDay.get(sleepDay)?.sleepDuration : undefined,
    sleepDay, sleep: sleepDay ? sleepByDay.get(sleepDay) : undefined,
    latest, bloodPressure, days: [...days].sort().reverse()
  };
}

export function syncWarningMessage(code: string) {
  const messages: Record<string, string> = {
    oxygenUnavailable: "Дополнительный канал кислорода недоступен.",
    hrvUnavailable: "Дополнительный канал HRV недоступен.",
    temperatureUnavailable: "Историю температуры не удалось прочитать.",
    manualDeviceMismatch: "Ручные измерения не удалось сопоставить с браслетом.",
    activityProfileMissing: "Для расчёта калорий и расстояния SDK не получил рост из браслета.",
    manualTemperatureUnits: "Формат ручной температуры ещё уточняется. Автоматическая история читается отдельно.",
    manualMetUnits: "Формат ручного MET ещё уточняется. Автоматическая история читается отдельно."
  };
  return messages[code] ?? "Часть данных SDK пока недоступна.";
}

export function syncErrorMessage(code?: string) {
  const messages: Record<string, string> = {
    syncBuildRequired: "Для чтения данных установите новую dev-сборку AxMed.",
    disconnected: "Соединение потеряно. Подключите браслет и повторите.",
    syncTimeout: "Браслет не ответил вовремя. Подключите его заново и повторите.",
    syncInterrupted: "Чтение прервано. Оставьте AxMed открытым и повторите подключение.",
    syncCancelled: "Чтение отменено.",
    syncUnsupported: "SDK не смог прочитать историю этого браслета.",
    syncBusy: "Синхронизация уже идёт.",
    authRequired: "Для сохранения данных войдите в аккаунт.",
    UNAUTHORIZED: "Сессия истекла. Выйдите и войдите снова.",
    NETWORK_ERROR: "Нет связи с сервером. Данные прочитаны, но ещё не сохранены в аккаунте.",
    TIMEOUT: "Сервер не ответил. Повторите сохранение.",
    VALIDATION_ERROR: "Сервер отклонил формат данных. Данные ещё не сохранены."
  };
  return messages[code ?? ""] ?? "Не удалось завершить синхронизацию. Попробуйте ещё раз.";
}
