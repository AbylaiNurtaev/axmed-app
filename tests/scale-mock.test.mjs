import assert from "node:assert/strict";
import test from "node:test";
import { mergeScaleBatches, withMockScaleComposition } from "../src/devices/mockScaleComposition.ts";

const weight = {
  sourceRecordId: "scale:fixture:1",
  metric: "weight",
  value: 80.15,
  unit: "kg",
  origin: "automatic",
  recordedAt: "2026-11-14T07:20:43.000Z",
  localDate: "2026-11-14"
};
const batch = {
  device: { id: "scale-fixture", name: "AxMed Scale", adapterId: "lefu-scale", kind: "scale" },
  readAt: weight.recordedAt,
  timeZone: "Asia/Almaty",
  historyDays: 1,
  skippedRecords: 0,
  samples: [weight]
};

test("scale demo keeps measured weight and adds a complete marked composition", () => {
  const result = withMockScaleComposition(batch);
  assert.equal(result.samples.find(sample => sample.metric === "weight").value, 80.15);
  assert.equal(result.samples.find(sample => sample.metric === "bodyFatPercentage").value, 22.8);
  assert.equal(result.samples.find(sample => sample.metric === "muscleMass").value, 58.7);
  assert.equal(result.samples.find(sample => sample.metric === "trunkMuscleMass").origin, "mock");
  assert.equal(result.samples.filter(sample => sample.origin === "mock").length, 20);
  assert.ok(result.warnings.includes("mockBodyComposition"));
});

test("scale demo is deterministic and replaces existing mock metrics", () => {
  const once = withMockScaleComposition(batch);
  const twice = withMockScaleComposition(once);
  assert.equal(twice.samples.length, once.samples.length);
  assert.deepEqual(twice, once);
});

test("batches without weight are left untouched", () => {
  const empty = { ...batch, samples: [] };
  assert.equal(withMockScaleComposition(empty), empty);
});

test("new scale readings keep previous measurements and their composition", () => {
  const first = withMockScaleComposition(batch);
  const nextWeight = { ...weight, sourceRecordId: "scale:fixture:2", value: 79.8, recordedAt: "2026-11-15T07:20:43.000Z", localDate: "2026-11-15" };
  const merged = withMockScaleComposition(mergeScaleBatches(first, { ...batch, readAt: nextWeight.recordedAt, samples: [nextWeight] }));
  assert.equal(merged.samples.filter(sample => sample.metric === "weight").length, 2);
  assert.equal(merged.samples.filter(sample => sample.metric === "bodyFatPercentage").length, 2);
  assert.ok(merged.samples.some(sample => sample.sourceRecordId === weight.sourceRecordId && sample.metric === "muscleMass"));
});

test("real LEFU composition is never replaced by demo values", () => {
  const realFat = { ...weight, metric: "bodyFatPercentage", value: 19.2, unit: "percent", origin: "automatic" };
  const result = withMockScaleComposition({ ...batch, samples: [weight, realFat] });
  assert.equal(result.samples.find(sample => sample.metric === "bodyFatPercentage").value, 19.2);
  assert.equal(result.samples.find(sample => sample.metric === "bodyFatPercentage").origin, "automatic");
});
