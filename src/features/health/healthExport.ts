import type { DeviceReading, Metric } from "../../devices/types";

export type HealthReportPeriod = "week" | "month";
export type HealthExportKind = "pdf" | "csv";

const metricLabels: Partial<Record<Metric, string>> = {
  steps: "Шаги",
  heartRate: "Пульс",
  sleepDuration: "Сон",
  oxygenSaturation: "SpO₂",
  hrv: "HRV",
  stress: "Стресс",
  activeCalories: "Активные калории",
  distance: "Расстояние",
  weight: "Вес",
  bodyFatPercentage: "Процент жира",
  muscleMass: "Мышечная масса",
  bodyWaterPercentage: "Вода",
  proteinPercentage: "Белок",
  visceralFatLevel: "Висцеральный жир",
  boneMass: "Костная масса",
  basalMetabolicRate: "BMR",
  metabolicAge: "Метаболический возраст",
  bodyScore: "Оценка тела"
};

const unitLabels: Record<DeviceReading["unit"], string> = {
  count: "",
  bpm: "уд/мин",
  min: "мин",
  kg: "кг",
  km: "км",
  kcal: "ккал",
  percent: "%",
  mmHg: "мм рт. ст.",
  celsius: "°C",
  ms: "мс",
  score: "",
  MET: "MET",
  years: "лет"
};

const scaleMetrics = new Set<Metric>([
  "weight", "bodyFatPercentage", "muscleMass", "bodyWaterPercentage", "proteinPercentage",
  "visceralFatLevel", "boneMass", "basalMetabolicRate", "metabolicAge", "bodyScore",
  "leftArmFatPercentage", "rightArmFatPercentage", "leftLegFatPercentage", "rightLegFatPercentage", "trunkFatPercentage",
  "leftArmMuscleMass", "rightArmMuscleMass", "leftLegMuscleMass", "rightLegMuscleMass", "trunkMuscleMass"
]);

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function html(value: string | number) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

function displayValue(reading: DeviceReading) {
  const value = reading.metric === "sleepDuration" ? reading.value / 60 : reading.value;
  const digits = ["weight", "distance", "bodyFatPercentage", "muscleMass", "bodyWaterPercentage"].includes(reading.metric) ? 1 : 0;
  const unit = reading.metric === "sleepDuration" ? "ч" : unitLabels[reading.unit];
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
}

function byMetric(samples: readonly DeviceReading[]) {
  const groups = new Map<Metric, DeviceReading[]>();
  for (const sample of samples) {
    const readings = groups.get(sample.metric) ?? [];
    readings.push(sample);
    groups.set(sample.metric, readings);
  }
  for (const readings of groups.values()) readings.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  return groups;
}

function sparkline(readings: readonly DeviceReading[], color: string) {
  if (readings.length < 2) return "";
  const display = readings.length <= 24 ? readings : readings.filter((_, index) => index % Math.ceil(readings.length / 24) === 0 || index === readings.length - 1);
  const values = display.map(reading => reading.value);
  const minimum = Math.min(...values);
  const range = Math.max(0.001, Math.max(...values) - minimum);
  const points = display.map((reading, index) => `${12 + index * (196 / Math.max(1, display.length - 1))},${58 - ((reading.value - minimum) / range) * 38}`).join(" ");
  return `<svg viewBox="0 0 220 70" role="img" aria-label="График показателя"><path d="M12 58 H208" stroke="#E4E8E4"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function buildHealthCsv(samples: readonly DeviceReading[], generatedAt = new Date()) {
  const rows = [["Дата", "Показатель", "Значение", "Единица", "Источник", "Происхождение"]];
  for (const sample of [...samples].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))) {
    rows.push([
      sample.recordedAt,
      metricLabels[sample.metric] ?? sample.metric,
      String(sample.value),
      unitLabels[sample.unit],
      scaleMetrics.has(sample.metric) ? "Умные весы" : "Браслет",
      sample.origin === "mock" ? "Демо" : "Реальные данные"
    ]);
  }
  rows.push([], ["Сформировано", generatedAt.toISOString()]);
  return `\uFEFF${rows.map(row => row.map(csvCell).join(",")).join("\n")}`;
}

export function buildHealthPdfHtml(samples: readonly DeviceReading[], period: HealthReportPeriod, generatedAt = new Date()) {
  const groups = byMetric(samples);
  const selectedMetrics: Metric[] = ["steps", "sleepDuration", "heartRate", "oxygenSaturation", "weight", "bodyFatPercentage", "muscleMass", "bodyWaterPercentage"];
  const cards = selectedMetrics.flatMap((metric, index) => {
    const readings = groups.get(metric);
    if (!readings?.length) return [];
    const latest = readings.at(-1)!;
    const average = readings.reduce((sum, reading) => sum + reading.value, 0) / readings.length;
    const delta = latest.value - readings[0].value;
    const label = metricLabels[metric] ?? metric;
    const demo = latest.origin === "mock" ? '<span class="demo">Демо</span>' : "";
    const color = ["#237354", "#7167B8", "#E66D52", "#4E83C4"][index % 4];
    return [`<article class="metric"><div class="metric-head"><span>${html(label)}</span>${demo}</div><strong>${html(displayValue(latest))}</strong><small>Среднее: ${html(displayValue({ ...latest, value: average }))} · Изменение: ${delta > 0 ? "+" : ""}${html(delta.toFixed(1))}</small>${sparkline(readings, color)}</article>`];
  }).join("");
  const periodLabel = period === "week" ? "7 дней" : "30 дней";
  const realCount = samples.filter(sample => sample.origin !== "mock").length;
  const demoCount = samples.length - realCount;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:32px}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#131816;background:#fff;margin:0}header{padding:26px;border-radius:24px;background:#16251E;color:white}.brand{font-size:28px;font-weight:800}.subtitle{margin-top:6px;color:#C5D0C9;font-size:13px}.meta{display:flex;gap:10px;margin-top:18px}.pill{padding:8px 12px;border-radius:12px;background:#283A31;font-size:11px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.summary div{padding:14px;border:1px solid #E3E8E4;border-radius:16px}.summary strong{display:block;font-size:22px}.summary span{font-size:10px;color:#7B837E}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.metric{break-inside:avoid;padding:16px;border:1px solid #E3E8E4;border-radius:18px}.metric-head{display:flex;justify-content:space-between;color:#7B837E;font-size:11px}.metric strong{display:block;font-size:22px;margin-top:8px}.metric small{display:block;color:#7B837E;margin-top:5px}.metric svg{width:100%;height:62px;margin-top:8px}.demo{padding:3px 7px;border-radius:8px;background:#FFF3D8;color:#8A6728;font-size:8px;font-weight:800}footer{margin-top:20px;padding-top:14px;border-top:1px solid #E3E8E4;color:#7B837E;font-size:9px;line-height:1.5}
  </style></head><body><header><div class="brand">AxMed</div><div class="subtitle">Отчёт о показателях здоровья · ${periodLabel}</div><div class="meta"><span class="pill">Сформирован: ${html(generatedAt.toLocaleString("ru-RU"))}</span><span class="pill">Записей: ${samples.length}</span></div></header><section class="summary"><div><strong>${realCount}</strong><span>реальных значений</span></div><div><strong>${demoCount}</strong><span>демо-значений</span></div><div><strong>${groups.size}</strong><span>показателей</span></div></section><main class="grid">${cards || '<article class="metric"><strong>Нет данных</strong><small>За выбранный период измерений нет.</small></article>'}</main><footer>Отчёт предназначен для наблюдения за динамикой. Он не является медицинским заключением, диагнозом или рекомендацией по лечению.</footer></body></html>`;
}

function fileDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function shareHealthExport(kind: HealthExportKind, samples: readonly DeviceReading[], period: HealthReportPeriod) {
  const generatedAt = new Date();
  const suffix = period === "week" ? "week" : "month";
  const fileName = `AxMed-health-${suffix}-${fileDate(generatedAt)}.${kind}`;
  const Sharing = await import("expo-sharing");
  if (!await Sharing.isAvailableAsync()) throw new Error("SHARING_UNAVAILABLE");
  if (kind === "pdf") {
    const Print = await import("expo-print");
    const FileSystem = await import("expo-file-system/legacy");
    const result = await Print.printToFileAsync({ html: buildHealthPdfHtml(samples, period, generatedAt), base64: false });
    const destination = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.deleteAsync(destination, { idempotent: true });
    await FileSystem.moveAsync({ from: result.uri, to: destination });
    await Sharing.shareAsync(destination, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Поделиться отчётом AxMed" });
    return { fileName, uri: destination };
  }
  const FileSystem = await import("expo-file-system/legacy");
  const destination = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(destination, buildHealthCsv(samples, generatedAt), { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(destination, { mimeType: "text/csv", UTI: "public.comma-separated-values-text", dialogTitle: "Поделиться данными AxMed" });
  return { fileName, uri: destination };
}
