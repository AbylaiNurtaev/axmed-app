import Foundation
import VeepooBleSDK

enum HBandHistoryReader {
  static func read(device: VPPeripheralModel, referenceDate: Date, days: Int,
                   channels: Set<String>, activity: [String: [String: Any]], manual: VPManualTestDataModel?)
    -> HBandSampleBuilder {
    let b = HBandSampleBuilder(referenceDate: referenceDate)
    guard let address = device.deviceAddress else { return b }
    for offset in 0..<min(7, max(1, days)) {
      guard let dayDate = b.calendar.date(byAdding: .day, value: -offset, to: referenceDate) else { continue }
      let day = b.day(dayDate)
      let original = VPDataBaseOperation.veepooSDKGetOriginalData(withDate: day, andTableID: address) as? [String: Any] ?? [:]
      for (time, raw) in original {
        guard let row = raw as? [String: Any], time.range(of: #"^\d{2}:\d{2}$"#, options: .regularExpression) != nil else {
          b.skipped += 1; continue
        }
        let timestamp = b.date("\(day) \(time)")
        let key = "\(day):\(time)"
        if row["stepValue"] != nil {
          b.append("steps", value: b.numeric(row["stepValue"]), unit: "count", key: key, start: timestamp, day: day)
        }
        if let heart = b.numeric(row["heartValue"]), heart >= 20, heart <= 300 {
          b.append("heartRate", value: heart, unit: "bpm", key: key, start: timestamp, day: day)
        } else if let heart = b.mean(row["ecgs"], range: 20...300) ?? b.mean(row["ppgs"], range: 20...300) {
          // Array elements have no documented timestamps: label the record mean.
          b.append("heartRate", value: heart, unit: "bpm", key: key, start: timestamp, day: day, aggregation: "mean")
        }
        if let stress = b.numeric(row["stress"]), stress > 0 {
          b.append("stress", value: stress, unit: "score", key: key, start: timestamp, day: day)
        }
        if let met = b.numeric(row["met"]), met > 0 {
          b.append("met", value: met, unit: "MET", key: key, start: timestamp, day: day)
        }
      }
      // Documented units, using height ALREADY stored in the bracelet.
      // No default/demo profile or conversion of undocumented raw units.
      if let totals = activity[day] {
        for (metric, field, unit) in [("distance", "Dis", "km"), ("activeCalories", "Cal", "kcal")] {
          if totals[field] != nil {
            b.append(metric, value: b.numeric(totals[field]), unit: unit, key: "daily:\(day)",
                     start: b.calendar.startOfDay(for: dayDate), day: day, aggregation: "dailyTotal")
          }
        }
      }
      let pressures = VPDataBaseOperation.veepooSDKGetBloodData(withDate: day, andTableID: address) as? [[String: Any]] ?? []
      for row in pressures {
        guard let time = row["Time"] as? String else { b.skipped += 1; continue }
        b.pressure(high: b.numeric(row["systolic"]), low: b.numeric(row["diastolic"]),
                   key: "blood:\(day):\(time)", start: b.date("\(day) \(time)"), day: day)
      }
      if channels.contains("oxygen") {
        let rows = VPDataBaseOperation.veepooSDKGetDeviceOxygenData(withDate: day, andTableID: address) as? [[String: Any]] ?? []
        for row in rows {
          guard let time = row["Time"] as? String else { b.skipped += 1; continue }
          if let value = b.numeric(row["OxygenValue"]), value != 0 {
            b.append("oxygenSaturation", value: value, unit: "percent", key: "oxygen:\(day):\(time)", start: b.date("\(day) \(time)"), day: day)
          }
        }
      }
      if channels.contains("hrv") {
        let rows = VPDataBaseOperation.veepooSDKGetDeviceHrvData(withDate: day, andTableID: address) as? [[String: Any]] ?? []
        for row in rows {
          guard let time = row["time"] as? String else { b.skipped += 1; continue }
          if let value = b.numeric(row["hrvValue"]), value != 0 {
            b.append("hrv", value: value, unit: "ms", key: "hrv:\(day):\(time)", start: b.date("\(day) \(time)"), day: day)
          }
        }
      }
      if channels.contains("temperature") {
        let rows = VPDataBaseOperation.veepooSDKGetDeviceTemperatureData(withDate: day, andTableID: address) as? [[String: Any]] ?? []
        for row in rows {
          guard let hour = b.numeric(row["hour"]), let minute = b.numeric(row["minute"]),
                (0...23).contains(hour), (0...59).contains(minute), hour.rounded() == hour, minute.rounded() == minute else { b.skipped += 1; continue }
          let time = String(format: "%02d:%02d", Int(hour), Int(minute))
          if let value = b.numeric(row["value"]), value != 0 {
            b.append("bodyTemperature", value: value, unit: "celsius", key: "temperature:\(day):\(time)", start: b.date("\(day) \(time)"), day: day)
          }
        }
      }
      readSleep(device: device, address: address, day: day, into: b)
    }
    if let manual { readManual(manual, into: b) }
    return b
  }

  private static func readSleep(device: VPPeripheralModel, address: String, day: String, into b: HBandSampleBuilder) {
    if device.sleepType != 0 && device.sleepType != 2 {
      let sleeps = VPDataBaseOperation.veepooSDKGetAccurateSleepData(withDate: day, andTableID: address) ?? []
      var chainStart: Date?
      var chainKey: String?
      for sleep in sleeps.sorted(by: { $0.sleepTime < $1.sleepTime }) {
        let start = b.date(sleep.sleepTime)
        if sleep.lastType != "1" { chainStart = start; chainKey = sleep.sleepTime }
        if sleep.nextType == "1" { continue }
        let combinedStart = sleep.lastType == "1" ? chainStart : start
        let end = b.date(sleep.wakeTime)
        let key = "accurate:\(chainKey ?? sleep.sleepTime)"
        let fields = [("sleepDuration", sleep.sleepDuration), ("sleepDeep", sleep.deepDuration),
                      ("sleepLight", sleep.lightDuration), ("sleepRem", sleep.otherDuration), ("sleepAwake", sleep.getUpDuration)]
        for (metric, raw) in fields {
          b.append(metric, value: Double(raw), unit: "min", key: key, start: combinedStart, end: end, day: day)
        }
        chainStart = nil; chainKey = nil
      }
    } else {
      let sleeps = VPDataBaseOperation.veepooSDKGetSleepData(withDate: day, andTableID: address) as? [[String: Any]] ?? []
      for sleep in sleeps {
        guard let startText = sleep["SLEEP_TIME"] as? String, let endText = sleep["WAKE_TIME"] as? String,
              let hours = b.numeric(sleep["SLE_HOUR"]), let minutes = b.numeric(sleep["SLE_MINUTE"]) else { b.skipped += 1; continue }
        let key = "normal:\(startText)"
        let start = b.date(startText), end = b.date(endText)
        b.append("sleepDuration", value: hours * 60 + minutes, unit: "min", key: key, start: start, end: end, day: day)
        for (metric, field) in [("sleepDeep", "DEEP_HOUR"), ("sleepLight", "LIGHT_HOUR")] {
          if let hours = b.numeric(sleep[field]) {
            b.append(metric, value: (hours * 60).rounded(), unit: "min", key: key, start: start, end: end, day: day)
          }
        }
      }
    }
  }

  private static func readManual(_ model: VPManualTestDataModel, into b: HBandSampleBuilder) {
    func array(_ metric: String, _ raw: Any, _ timestamp: UInt32, _ unit: String, _ bounds: ClosedRange<Double>) {
      let start = Date(timeIntervalSince1970: Double(timestamp))
      if let value = b.mean(raw, range: bounds) {
        b.append(metric, value: value, unit: unit, key: "manual:\(timestamp)", start: start,
                 day: b.day(start), aggregation: "mean", origin: "manual")
      }
    }
    for item in model.heartRateArr { array("heartRate", item.heartArray, item.timestamp, "bpm", 20...300) }
    for item in model.bloodOxygenArr { array("oxygenSaturation", item.bloodOxygenArray, item.timestamp, "percent", 1...100) }
    for item in model.hrvArr { array("hrv", item.hrvArray, item.timestamp, "ms", 1...500) }
    for item in model.bloodPressureArr {
      let start = Date(timeIntervalSince1970: Double(item.timestamp))
      if item.state == 2 || item.state == 9 { b.skipped += 1; continue }
      b.pressure(high: Double(item.h_bp), low: Double(item.l_bp), key: "manual:\(item.timestamp)", start: start, day: b.day(start), origin: "manual")
    }
    for item in model.stressArr {
      let start = Date(timeIntervalSince1970: Double(item.timestamp))
      b.append("stress", value: Double(item.value), unit: "score", key: "manual:\(item.timestamp)", start: start, day: b.day(start), origin: "manual")
    }
    // These integer fields have NO scale documented in SDK 2.2.98.15.
    // Do not guess /10 vs /100. Automatic temperature (°C) and MET are read above.
    if !model.bodyTempArr.isEmpty { b.warnings.insert("manualTemperatureUnits") }
    if !model.metArr.isEmpty { b.warnings.insert("manualMetUnits") }
  }
}
