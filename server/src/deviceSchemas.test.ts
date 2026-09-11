import assert from "node:assert/strict";
import { test } from "node:test";
import { deviceSyncSchema, readingSchema } from "./deviceSchemas.js";

const reading = { sourceRecordId: "steps:2026-09-10:10:00", metric: "steps", value: 20, unit: "count", recordedAt: "2026-09-10T05:00:00Z", localDate: "2026-09-10" };
test("device readings validate units, ranges, intervals and timestamps", () => {
  assert.ok(readingSchema.safeParse(reading).success);
  for (const patch of [{ value: -1 }, { value: 1.5 }, { unit: "bpm" }, { recordedAt: "2099-01-01T00:00:00Z" }, { localDate: "2026-02-31" }, { userId: "other-user" }]) {
    assert.equal(readingSchema.safeParse({ ...reading, ...patch }).success, false);
  }
  assert.equal(readingSchema.safeParse({ ...reading, metric: "heartRate", unit: "bpm", value: 0 }).success, false);
  assert.equal(readingSchema.safeParse({ ...reading, metric: "sleepDuration", unit: "min", value: 500, periodEnd: "2026-09-10T06:00:00Z" }).success, false);
});
test("sync validates battery bars, batch size and does not accept user-selected ownership", () => {
  const batch = { device: { id: "uuid", name: "G72", adapterId: "hband", kind: "fitness-band" }, timeZone: "Asia/Almaty", readAt: "2026-09-10T06:00:00Z", historyDays: 7, skippedRecords: 0, samples: [reading], complete: true };
  assert.ok(deviceSyncSchema.safeParse(batch).success);
  assert.equal(deviceSyncSchema.safeParse({ ...batch, battery: { unit: "bars", value: 50, low: false } }).success, false);
  assert.equal(deviceSyncSchema.safeParse({ ...batch, userId: "other-user" }).success, false);
  assert.equal(deviceSyncSchema.safeParse({ ...batch, complete: false }).success, false);
  assert.equal(deviceSyncSchema.safeParse({ ...batch, timeZone: "wrong" }).success, false);
  assert.ok(deviceSyncSchema.safeParse({ ...batch, samples: Array(10001).fill(reading) }).success);
  assert.equal(deviceSyncSchema.safeParse({ ...batch, samples: Array(60001).fill(reading) }).success, false);
});

test("extended metrics keep exact units and reject raw/scaled/sentinel values", () => {
  const values = [
    ["distance", "km", 3.06], ["activeCalories", "kcal", 256.4], ["oxygenSaturation", "percent", 96],
    ["bodyTemperature", "celsius", 36.2], ["hrv", "ms", 40], ["stress", "score", 36], ["met", "MET", 0.9],
    ["bloodPressureSystolic", "mmHg", 123], ["bloodPressureDiastolic", "mmHg", 88]
  ];
  for (const [metric, unit, value] of values) {
    assert.ok(readingSchema.safeParse({ ...reading, metric, unit, value, origin: "manual" }).success, String(metric));
    assert.equal(readingSchema.safeParse({ ...reading, metric, unit: "kg", value }).success, false);
  }
  for (const [metric, unit, value] of [["bodyTemperature", "celsius", 3620], ["oxygenSaturation", "percent", 255], ["hrv", "ms", 0], ["stress", "score", 101]]) {
    assert.equal(readingSchema.safeParse({ ...reading, metric, unit, value }).success, false);
  }
  assert.ok(readingSchema.safeParse({ ...reading, metric: "heartRate", unit: "bpm", value: 82.5, aggregation: "mean" }).success);
  assert.ok(readingSchema.safeParse({ ...reading, metric: "sleepRem", unit: "min", value: 0, periodEnd: "2026-09-10T06:00:00Z" }).success);
  assert.equal(readingSchema.safeParse({ ...reading, aggregation: "mean" }).success, false);
  assert.equal(readingSchema.safeParse({ ...reading, metric: "sleepDeep", unit: "min", value: 10 }).success, false);
});
