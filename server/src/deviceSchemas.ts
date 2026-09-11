import { z } from "zod";

const id = z.string().min(1).max(160);
const units = { steps: "count", heartRate: "bpm", sleepDuration: "min", weight: "kg",
  distance: "km", activeCalories: "kcal", oxygenSaturation: "percent", bloodPressureSystolic: "mmHg",
  bloodPressureDiastolic: "mmHg", bodyTemperature: "celsius", hrv: "ms", stress: "score", met: "MET",
  sleepDeep: "min", sleepLight: "min", sleepRem: "min", sleepAwake: "min" } as const;
const ranges: Record<keyof typeof units, [number, number]> = {
  steps: [0, 100000], heartRate: [20, 300], sleepDuration: [1, 1440], weight: [0.1, 1000],
  distance: [0, 1000], activeCalories: [0, 30000], oxygenSaturation: [1, 100],
  bloodPressureSystolic: [30, 300], bloodPressureDiastolic: [10, 200], bodyTemperature: [20, 50],
  hrv: [1, 500], stress: [0, 100], met: [0.1, 30], sleepDeep: [0, 1440], sleepLight: [0, 1440], sleepRem: [0, 1440], sleepAwake: [0, 1440]
};
export const readingSchema = z.object({
  sourceRecordId: id,
  metric: z.enum(Object.keys(units) as [keyof typeof units, ...(keyof typeof units)[]]),
  value: z.number().finite().min(0).max(100000),
  unit: z.enum(["count", "bpm", "min", "kg", "km", "kcal", "percent", "mmHg", "celsius", "ms", "score", "MET"]),
  aggregation: z.enum(["mean", "dailyTotal"]).optional(),
  origin: z.enum(["automatic", "manual"]).optional(),
  recordedAt: z.iso.datetime(),
  periodEnd: z.iso.datetime().optional(),
  localDate: z.iso.date()
}).strict().superRefine((reading, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if (units[reading.metric] !== reading.unit) fail("Unit does not match metric");
  const [min, max] = ranges[reading.metric];
  if (reading.value < min || reading.value > max) fail("Invalid metric value");
  const sleep = reading.metric.startsWith("sleep");
  if (sleep && !reading.periodEnd) fail("Sleep requires an interval");
  if (reading.aggregation === "dailyTotal" && !["distance", "activeCalories"].includes(reading.metric)) fail("Invalid daily total");
  if (reading.aggregation === "mean" && !["heartRate", "oxygenSaturation", "hrv"].includes(reading.metric)) fail("Invalid mean");
  if (reading.metric === "steps" && !Number.isInteger(reading.value)) fail("Steps must be integers");
  if (reading.metric === "heartRate" && (reading.value < 20 || reading.value > 300)) fail("Invalid heart rate");
  if (reading.metric === "weight" && (reading.value < 0.1 || reading.value > 1000)) fail("Invalid weight");
  if (reading.metric === "sleepDuration" && (reading.value < 1 || reading.value > 1440 || !reading.periodEnd)) fail("Invalid sleep duration");
  const start = Date.parse(reading.recordedAt);
  const end = reading.periodEnd ? Date.parse(reading.periodEnd) : undefined;
  if (start < Date.UTC(2000, 0, 1) || start > Date.now() + 300000) fail("Invalid reading date");
  if (end !== undefined && (end <= start || end > Date.now() + 300000)) fail("Invalid interval");
  if (sleep && end !== undefined && reading.value > (end - start) / 60000 + 5) fail("Duration exceeds interval");
});
export const deviceSyncSchema = z.object({
  device: z.object({
    id,
    name: z.string().trim().min(1).max(120),
    adapterId: z.string().regex(/^[a-z0-9-]{1,40}$/),
    kind: z.enum(["fitness-band", "scale"])
  }).strict(),
  readAt: z.iso.datetime().refine(value => Date.parse(value) <= Date.now() + 300000, "Invalid sync date"),
  timeZone: z.string().min(1).max(100).refine(value => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }, "Unknown time zone"),
  historyDays: z.number().int().min(1).max(31),
  skippedRecords: z.number().int().min(0).max(100000),
  battery: z.object({ value: z.number().int().min(0).max(100), unit: z.enum(["percent", "bars"]), low: z.boolean() })
    .strict().refine(value => value.unit !== "bars" || value.value <= 4, "Invalid battery bars").optional(),
  samples: z.array(readingSchema).max(60000),
  syncVersion: z.number().int().min(1).max(2).optional(),
  warnings: z.array(z.string().regex(/^[a-zA-Z]{1,50}$/)).max(20).optional(),
  complete: z.literal(true)
}).strict();
export type DeviceSyncInput = z.infer<typeof deviceSyncSchema>;
