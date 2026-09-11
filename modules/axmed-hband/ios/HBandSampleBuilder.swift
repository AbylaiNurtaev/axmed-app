import Foundation

// SDK-independent normalizer, tested with swiftc during the iOS build.
// Bounds reject malformed transport values, NOT clinical reference ranges.
final class HBandSampleBuilder {
  let referenceDate: Date
  var calendar = Calendar(identifier: .gregorian)
  private let formatter = DateFormatter()
  private let iso = ISO8601DateFormatter()
  private(set) var records: [String: [String: Any]] = [:]
  var skipped = 0
  var warnings = Set<String>()
  init(referenceDate: Date, timeZone: TimeZone = .current) {
    self.referenceDate = referenceDate
    calendar.timeZone = timeZone
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = calendar
    formatter.timeZone = timeZone
    formatter.isLenient = false
  }
  func day(_ date: Date) -> String {
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
  }
  func date(_ text: String) -> Date? {
    for format in ["yyyy-MM-dd HH:mm", "yyyy/MM/dd HH:mm", "yyyy-MM-dd HH:mm:ss", "yyyy/MM/dd HH:mm:ss"] {
      formatter.dateFormat = format
      if let value = formatter.date(from: text) { return value }
    }
    return nil
  }
  func numeric(_ raw: Any?) -> Double? {
    if let value = raw as? NSNumber { return value.doubleValue }
    if let value = raw as? String { return Double(value) }
    return nil
  }
  func mean(_ raw: Any?, range: ClosedRange<Double>) -> Double? {
    guard let array = raw as? [Any] else { return nil }
    let values = array.compactMap(numeric).filter { $0.isFinite && range.contains($0) }
    guard !values.isEmpty else { return nil }
    return (values.reduce(0, +) / Double(values.count) * 10).rounded() / 10
  }
  func append(_ metric: String, value: Double?, unit: String, key: String,
              start: Date?, end: Date? = nil, day: String, aggregation: String? = nil,
              origin: String = "automatic") {
    let bounds: [String: ClosedRange<Double>] = [
      "steps": 0...100000, "heartRate": 20...300, "sleepDuration": 1...1440,
      "distance": 0...1000, "activeCalories": 0...30000, "oxygenSaturation": 1...100,
      "bloodPressureSystolic": 30...300, "bloodPressureDiastolic": 10...200,
      "bodyTemperature": 20...50, "hrv": 1...500, "stress": 0...100, "met": 0.1...30,
      "sleepDeep": 0...1440, "sleepLight": 0...1440, "sleepRem": 0...1440, "sleepAwake": 0...1440
    ]
    guard let value, value.isFinite, let range = bounds[metric], range.contains(value), let start,
          start >= referenceDate.addingTimeInterval(-8 * 86400),
          start <= referenceDate.addingTimeInterval(300),
          metric != "steps" || value.rounded() == value,
          !metric.hasPrefix("sleep") || end != nil else { skipped += 1; return }
    if let end, end <= start || end > referenceDate.addingTimeInterval(300) ||
      (metric.hasPrefix("sleep") && value > end.timeIntervalSince(start) / 60 + 5) {
      skipped += 1; return
    }
    let id = "\(metric):\(key)"
    var sample: [String: Any] = ["sourceRecordId": id, "metric": metric, "value": value,
      "unit": unit, "recordedAt": iso.string(from: start), "localDate": day, "origin": origin]
    if let end { sample["periodEnd"] = iso.string(from: end) }
    if let aggregation { sample["aggregation"] = aggregation }
    records[id] = sample
  }
  func pressure(high: Double?, low: Double?, key: String, start: Date?, day: String, origin: String = "automatic") {
    guard let high, let low, high >= 30, high <= 300, low >= 10, low <= 200, high > low else {
      if high != 0 || low != 0 { skipped += 1 }
      return
    }
    // Never infer/reverse high and low despite a swapped example in vendor docs.
    append("bloodPressureSystolic", value: high, unit: "mmHg", key: key, start: start, day: day, origin: origin)
    append("bloodPressureDiastolic", value: low, unit: "mmHg", key: key, start: start, day: day, origin: origin)
  }
  var samples: [[String: Any]] {
    records.values.sorted {
      let a = ($0["recordedAt"] as? String ?? "", $0["sourceRecordId"] as? String ?? "")
      let b = ($1["recordedAt"] as? String ?? "", $1["sourceRecordId"] as? String ?? "")
      return a < b
    }
  }
}
