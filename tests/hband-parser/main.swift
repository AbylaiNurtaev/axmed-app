import Foundation

let now = ISO8601DateFormatter().date(from: "2026-09-11T17:20:00Z")!
let b = HBandSampleBuilder(referenceDate: now, timeZone: TimeZone(identifier: "Asia/Almaty")!)
assert(b.day(now) == "2026-09-11")
assert(b.date("2026-09-11 22:20") == now)
assert(b.mean([0, "80", "84", 255, 999, "bad"], range: 20...200) == 82)
assert(b.mean([0, "bad"], range: 20...300) == nil)
assert(b.mean([Double.nan, Double.infinity], range: 1...100) == nil)
let start = b.date("2026-09-11 01:51")!
let end = b.date("2026-09-11 11:04")!
b.append("sleepDuration", value: 553, unit: "min", key: "sleep", start: start, end: end, day: "2026-09-11")
b.append("sleepRem", value: 0, unit: "min", key: "sleep", start: start, end: end, day: "2026-09-11")
b.append("steps", value: 0, unit: "count", key: "steps", start: now, day: "2026-09-11")
b.append("steps", value: 120, unit: "count", key: "steps", start: now, day: "2026-09-11")
b.append("heartRate", value: 82, unit: "bpm", key: "mean", start: now, day: "2026-09-11", aggregation: "mean", origin: "manual")
b.append("bodyTemperature", value: 36.2, unit: "celsius", key: "temp", start: now, day: "2026-09-11")
b.pressure(high: 123, low: 88, key: "bp", start: now, day: "2026-09-11")
assert(b.samples.count == 7)
assert(b.records["steps:steps"]?["value"] as? Double == 120)
assert(b.records["heartRate:mean"]?["aggregation"] as? String == "mean")
// Reject unsupported scales, sentinels, corrupt dates and invalid pairs.
b.append("bodyTemperature", value: 3620, unit: "celsius", key: "bad", start: now, day: "2026-09-11")
b.append("heartRate", value: 0, unit: "bpm", key: "bad", start: now, day: "2026-09-11")
b.append("sleepDeep", value: 900, unit: "min", key: "bad", start: start, end: end, day: "2026-09-11")
b.append("steps", value: 2, unit: "count", key: "bad", start: now.addingTimeInterval(600), day: "2026-09-11")
b.pressure(high: 80, low: 120, key: "bad", start: now, day: "2026-09-11")
assert(b.samples.count == 7 && b.skipped == 5)
print("HBand sample normalizer: all assertions passed")
