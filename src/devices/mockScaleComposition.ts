import type { DeviceReading, DeviceSyncBatch, Metric } from "./types";

const MOCK_WARNING = "mockBodyComposition";

type MockMetric = {
  metric: Metric;
  value: number;
  unit: DeviceReading["unit"];
};

function round(value: number, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mockMetrics(weight: number): MockMetric[] {
  const weightOffset = weight - 80;
  const fat = round(clamp(22.8 + weightOffset * 0.08, 12, 38));
  const muscle = round(clamp(weight * 0.733, 35, 105));
  const segmentFactor = muscle / 58.7;

  return [
    { metric: "heartRate", value: 78, unit: "bpm" },
    { metric: "bodyFatPercentage", value: fat, unit: "percent" },
    { metric: "muscleMass", value: muscle, unit: "kg" },
    { metric: "bodyWaterPercentage", value: round(clamp(55.1 - weightOffset * 0.025, 42, 68)), unit: "percent" },
    { metric: "proteinPercentage", value: 17.4, unit: "percent" },
    { metric: "visceralFatLevel", value: Math.round(clamp(8 + weightOffset * 0.05, 3, 18)), unit: "score" },
    { metric: "boneMass", value: round(clamp(weight * 0.04, 2.2, 5.2)), unit: "kg" },
    { metric: "basalMetabolicRate", value: Math.round(clamp(1742 + weightOffset * 9, 1200, 2600)), unit: "kcal" },
    { metric: "metabolicAge", value: 29, unit: "years" },
    { metric: "bodyScore", value: Math.round(clamp(78 - Math.abs(weightOffset) * 0.12, 55, 92)), unit: "score" },
    { metric: "leftArmFatPercentage", value: round(fat - 2), unit: "percent" },
    { metric: "rightArmFatPercentage", value: round(fat - 1.6), unit: "percent" },
    { metric: "leftLegFatPercentage", value: round(fat + 0.1), unit: "percent" },
    { metric: "rightLegFatPercentage", value: round(fat + 0.3), unit: "percent" },
    { metric: "trunkFatPercentage", value: round(fat + 0.8), unit: "percent" },
    { metric: "leftArmMuscleMass", value: round(3.35 * segmentFactor, 2), unit: "kg" },
    { metric: "rightArmMuscleMass", value: round(3.42 * segmentFactor, 2), unit: "kg" },
    { metric: "leftLegMuscleMass", value: round(10.8 * segmentFactor, 2), unit: "kg" },
    { metric: "rightLegMuscleMass", value: round(10.95 * segmentFactor, 2), unit: "kg" },
    { metric: "trunkMuscleMass", value: round(30.18 * segmentFactor, 2), unit: "kg" }
  ];
}

export function withMockScaleComposition(batch: DeviceSyncBatch): DeviceSyncBatch {
  const latestWeight = batch.samples
    .filter(sample => sample.metric === "weight" && sample.unit === "kg")
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))[0];
  if (!latestWeight) return batch;

  const realMetrics = new Set(batch.samples
    .filter(sample => sample.sourceRecordId === latestWeight.sourceRecordId && sample.origin !== "mock")
    .map(sample => sample.metric));
  const mockSamples: DeviceReading[] = mockMetrics(latestWeight.value)
    .filter(item => !realMetrics.has(item.metric))
    .map(item => ({
    sourceRecordId: latestWeight.sourceRecordId,
    metric: item.metric,
    value: item.value,
    unit: item.unit,
    origin: "mock",
    recordedAt: latestWeight.recordedAt,
    localDate: latestWeight.localDate
  }));
  const mockMetricNames = new Set(mockSamples.map(sample => sample.metric));

  return {
    ...batch,
    syncVersion: 2,
    warnings: [...new Set([...(batch.warnings ?? []), MOCK_WARNING])],
    samples: [...batch.samples.filter(sample => !(
      sample.sourceRecordId === latestWeight.sourceRecordId
      && sample.origin === "mock"
      && mockMetricNames.has(sample.metric)
    )), ...mockSamples]
  };
}

export function mergeScaleBatches(previous: DeviceSyncBatch | undefined, current: DeviceSyncBatch): DeviceSyncBatch {
  if (!previous || previous.device.id !== current.device.id) return current;
  const readings = new Map<string, DeviceReading>();
  for (const sample of [...previous.samples, ...current.samples]) {
    readings.set(`${sample.sourceRecordId}:${sample.metric}:${sample.recordedAt}`, sample);
  }
  return {
    ...current,
    historyDays: Math.max(previous.historyDays, current.historyDays),
    warnings: [...new Set([...(previous.warnings ?? []), ...(current.warnings ?? [])])],
    samples: [...readings.values()].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
  };
}
