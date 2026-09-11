import assert from "node:assert/strict";
import { test } from "node:test";
import { SyncCoordinator } from "../src/devices/SyncCoordinator.ts";
import { readingSummary } from "../src/devices/readingSummary.ts";

const batch = {
  device: { id: "test-bracelet", name: "G72", adapterId: "hband", kind: "fitness-band" },
  readAt: "2026-09-11T12:00:00Z", timeZone: "Asia/Almaty", historyDays: 7, skippedRecords: 0,
  samples: []
};
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
async function fixture() {
  const read = deferred();
  const calls = [];
  let progress;
  let uploadsFail = false;
  const sync = new SyncCoordinator({
    disconnect: async () => { calls.push("disconnect"); },
    syncData: requestId => { calls.push(["read", requestId]); return read.promise; },
    subscribeSyncProgress: listener => { progress = listener; return () => { calls.push("unsubscribe"); }; }
  }, {
    load: async () => null,
    save: async value => { calls.push(["save", value]); if (uploadsFail) throw new Error("NETWORK_ERROR"); }
  });
  sync.setOwner("user-a");
  await Promise.resolve();
  return { sync, read, calls, emit: value => progress(value), offline: value => { uploadsFail = value; } };
}
test("sync is single-flight, reports matching progress and saves only a completed read", async () => {
  const f = await fixture();
  const first = f.sync.sync();
  assert.equal(f.sync.sync(), first);
  await Promise.resolve();
  const requestId = f.calls[0][1];
  f.emit({ requestId: "stale", progress: 90, stage: "history" });
  assert.equal(f.sync.getSnapshot().progress, 0);
  f.emit({ requestId, progress: 40, stage: "history" });
  assert.equal(f.sync.getSnapshot().progress, 40);
  assert.equal(f.calls.filter(call => call[0] === "save").length, 0);
  f.read.resolve(batch);
  await first;
  assert.equal(f.sync.getSnapshot().saved, true);
  assert.equal(f.sync.getSnapshot().phase, "complete");
  assert.equal(f.calls.filter(call => call[0] === "read").length, 1);
});
test("failed upload retains readings; retry does not reread the bracelet", async () => {
  const f = await fixture();
  f.offline(true);
  const work = f.sync.sync();
  f.read.resolve(batch);
  await work;
  assert.equal(f.sync.getSnapshot().saved, false);
  assert.equal(f.sync.getSnapshot().batch, batch);
  f.offline(false);
  await f.sync.retrySave();
  assert.equal(f.sync.getSnapshot().saved, true);
  assert.equal(f.calls.filter(call => call[0] === "read").length, 1);
});
test("logout rejects late native data and cannot upload into the next account", async () => {
  const f = await fixture();
  const work = f.sync.sync();
  await Promise.resolve();
  f.sync.setOwner("user-b");
  f.read.resolve(batch);
  await work;
  assert.equal(f.sync.getSnapshot().batch, undefined);
  assert.ok(f.calls.includes("disconnect"));
  assert.equal(f.calls.filter(call => call[0] === "save").length, 0);
});
test("cancel disconnects an in-flight read and ignores its completion", async () => {
  const f = await fixture();
  const work = f.sync.sync();
  await Promise.resolve();
  await f.sync.cancel();
  f.read.resolve(batch);
  await work;
  assert.equal(f.sync.getSnapshot().phase, "idle");
  assert.equal(f.sync.getSnapshot().batch, undefined);
  assert.equal(f.calls.filter(call => call[0] === "save").length, 0);
});
test("read errors never look like a completed sync and release the lock", async () => {
  const f = await fixture();
  const work = f.sync.sync();
  f.read.reject(Object.assign(new Error("timeout"), { code: "syncTimeout" }));
  await work;
  assert.equal(f.sync.getSnapshot().error, "syncTimeout");
  assert.equal(f.sync.getSnapshot().phase, "error");
  assert.equal(f.sync.getSnapshot().saved, false);
});
test("an old installed native build produces a helpful error, not fabricated data", async () => {
  const sync = new SyncCoordinator({ disconnect: async () => {} }, { load: async () => null, save: async () => assert.fail() });
  sync.setOwner("user-a");
  await sync.sync();
  assert.equal(sync.getSnapshot().error, "syncBuildRequired");
});
test("summary deduplicates intervals, uses device-local dates and keeps zero steps", () => {
  const sample = { sourceRecordId: "1", metric: "steps", value: 0, unit: "count", recordedAt: "2026-09-10T20:00:00Z", localDate: "2026-09-11" };
  const data = { ...batch, samples: [sample, sample, { ...sample, sourceRecordId: "2", value: 120 }] };
  assert.equal(readingSummary(data, new Date("2026-09-10T20:01:00Z")).steps, 120);
  assert.equal(readingSummary({ ...batch, samples: [sample] }, new Date(batch.readAt)).steps, 0);
  assert.equal(readingSummary(data, new Date("2026-09-12T12:00:00Z")).steps, undefined);
  assert.equal(readingSummary(data).heartRate, undefined);
});

test("expanded summary retains daily totals, latest manual means and same-record pressure pairs", () => {
  const at = "2026-09-11T16:24:00Z";
  const item = (metric, value, id = "manual:1", time = at, extra = {}) => ({
    metric, value, sourceRecordId: `${metric}:${id}`, recordedAt: time, localDate: "2026-09-11", ...extra
  });
  const data = { ...batch, samples: [
    item("distance", 3.06, "daily:2026-09-11"), item("distance", 3.06, "daily:2026-09-11"),
    item("activeCalories", 256.4, "daily:2026-09-11"), item("heartRate", 82, "manual:1", at, { aggregation: "mean", origin: "manual" }),
    item("bloodPressureSystolic", 123), item("bloodPressureDiastolic", 88),
    item("bloodPressureSystolic", 140, "manual:2", "2026-09-11T17:00:00Z"),
    item("sleepDuration", 553), item("sleepDeep", 90), item("sleepRem", 0), item("stress", 36), item("met", 0.9)
  ] };
  const result = readingSummary(data, new Date(at));
  assert.equal(result.distance, 3.06);
  assert.equal(result.activeCalories, 256.4);
  assert.equal(result.heartRate.value, 82);
  assert.equal(result.heartRate.aggregation, "mean");
  assert.equal(result.bloodPressure.high.value, 123);
  assert.equal(result.bloodPressure.low.value, 88);
  assert.equal(result.sleepMinutes, 553);
  assert.equal(result.sleep.sleepRem, 0);
  assert.equal(result.latest.met.value, 0.9);
  assert.equal(result.latest.bodyTemperature, undefined);
  const emptyDay = readingSummary(data, new Date(at), "2026-09-10");
  assert.equal(emptyDay.heartRate, undefined);
  assert.equal(emptyDay.distance, undefined);
  assert.equal(emptyDay.bloodPressure, undefined);
  assert.equal(emptyDay.sleepMinutes, undefined);
});

test("pressure cannot combine different records or times and zero activity remains visible", () => {
  const samples = [
    { metric: "bloodPressureSystolic", sourceRecordId: "bloodPressureSystolic:a", recordedAt: "2026-09-11T15:00:00Z", value: 123, localDate: "2026-09-11" },
    { metric: "bloodPressureDiastolic", sourceRecordId: "bloodPressureDiastolic:b", recordedAt: "2026-09-11T15:00:00Z", value: 88, localDate: "2026-09-11" },
    { metric: "distance", sourceRecordId: "daily", recordedAt: "2026-09-11T15:00:00Z", value: 0, localDate: "2026-09-11" }
  ];
  const result = readingSummary({ ...batch, samples }, new Date("2026-09-11T17:00:00Z"));
  assert.equal(result.bloodPressure, undefined);
  assert.equal(result.distance, 0);
});
