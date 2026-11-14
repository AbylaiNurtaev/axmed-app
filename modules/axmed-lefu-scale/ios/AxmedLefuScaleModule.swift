import ExpoModulesCore
import Foundation

#if targetEnvironment(simulator)

public class AxmedLefuScaleModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AxmedLefuScale")
    Events("onSnapshot", "onSyncProgress")
    AsyncFunction("getSnapshot") { self.snapshot() }
    AsyncFunction("startScan") { self.sendEvent("onSnapshot", self.snapshot()) }
    AsyncFunction("connect") { (_: String) in
      throw NSError(domain: "AxmedLefuScale", code: 1, userInfo: [NSLocalizedDescriptionKey: "Bluetooth scale scanning is unavailable in iOS Simulator"])
    }
    AsyncFunction("cancelPending") {}
    AsyncFunction("disconnect") {}
    AsyncFunction("syncData") { (_: String, promise: Promise) in
      promise.reject("simulatorUnsupported", "Bluetooth scale measurements are unavailable in iOS Simulator")
    }
  }

  private func snapshot() -> [String: Any] {
    ["phase": "idle", "devices": [], "errorCode": "simulatorUnsupported"]
  }
}

#else

public class AxmedLefuScaleModule: Module {
  private var devices: [String: LefuSDKDeviceInfo] = [:]
  private var phase = "idle"
  private var selectedID: String?
  private var errorCode: String?
  private var scanTimeout: DispatchWorkItem?
  private var syncTimeout: DispatchWorkItem?
  private var syncPromise: Promise?
  private var syncRequestID: String?

  private lazy var bridge: LefuSDKBridge = {
    let bridge = LefuSDKBridge()
    bridge.onState = { [weak self] state in
      DispatchQueue.main.async { self?.handleBluetoothState(state) }
    }
    bridge.onDevice = { [weak self] device in
      DispatchQueue.main.async { self?.handleDevice(device) }
    }
    bridge.onConnected = { [weak self] id in
      DispatchQueue.main.async { self?.handleConnected(id) }
    }
    bridge.onDisconnected = { [weak self] in
      DispatchQueue.main.async { self?.handleDisconnected() }
    }
    bridge.onWeight = { [weak self] weight, date in
      DispatchQueue.main.async { self?.completeMeasurement(weight: weight, date: date) }
    }
    bridge.onLiveWeight = { [weak self] weight in
      DispatchQueue.main.async { self?.liveMeasurement(weight: weight) }
    }
    bridge.onError = { [weak self] code in
      DispatchQueue.main.async { self?.fail(code) }
    }
    return bridge
  }()

  public func definition() -> ModuleDefinition {
    Name("AxmedLefuScale")
    Events("onSnapshot", "onSyncProgress")
    AsyncFunction("getSnapshot") { self.snapshot() }.runOnQueue(.main)
    AsyncFunction("startScan") { self.startScan() }.runOnQueue(.main)
    AsyncFunction("connect") { (id: String) in self.select(id) }.runOnQueue(.main)
    AsyncFunction("cancelPending") { self.cancelPending() }.runOnQueue(.main)
    AsyncFunction("disconnect") { self.disconnect() }.runOnQueue(.main)
    AsyncFunction("syncData") { (requestID: String, promise: Promise) in
      self.syncData(requestID, promise: promise)
    }.runOnQueue(.main)
    OnAppEntersBackground { DispatchQueue.main.async { self.disconnect() } }
    OnDestroy { DispatchQueue.main.async { self.disconnect() } }
  }

  private func startScan() {
    cancelMeasurement("syncCancelled")
    scanTimeout?.cancel()
    devices.removeAll()
    selectedID = nil
    errorCode = nil
    phase = "scanning"
    emit()
    bridge.startScan()
    let work = DispatchWorkItem { [weak self] in
      guard let self, self.selectedID == nil else { return }
      self.bridge.stopScan()
      self.phase = "idle"
      self.emit()
    }
    scanTimeout = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: work)
  }

  private func select(_ id: String) {
    guard devices[id] != nil else { fail("deviceNotFound"); return }
    scanTimeout?.cancel()
    selectedID = id
    errorCode = nil
    phase = "connecting"
    emit()
    bridge.connect(id: id)
  }

  private func syncData(_ requestID: String, promise: Promise) {
    guard syncPromise == nil else {
      promise.reject("syncBusy", "A scale measurement is already running")
      return
    }
    guard phase == "connected", let selectedID, devices[selectedID] != nil else {
      promise.reject("disconnected", "Select the scale first")
      return
    }
    syncPromise = promise
    syncRequestID = requestID
    progress(5, stage: "scalePreparing")
    bridge.startMeasurement()
    let work = DispatchWorkItem { [weak self] in self?.cancelMeasurement("measurementTimeout") }
    syncTimeout = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 90, execute: work)
  }

  private func completeMeasurement(weight: Double, date: Date) {
    guard weight >= 3, weight <= 182.5,
          let promise = syncPromise,
          let requestID = syncRequestID,
          let selectedID,
          let device = devices[selectedID] else { return }
    syncPromise = nil
    syncRequestID = nil
    syncTimeout?.cancel()
    bridge.stopMeasurement()
    progress(requestID, value: 76, stage: "scaleResult", weight: weight)
    let iso = ISO8601DateFormatter().string(from: date)
    let day = DateFormatter()
    day.calendar = Calendar(identifier: .gregorian)
    day.locale = Locale(identifier: "en_US_POSIX")
    day.timeZone = .current
    day.dateFormat = "yyyy-MM-dd"
    let serial = device.serial.isEmpty ? selectedID : device.serial
    let recordID = "\(serial):\(Int(date.timeIntervalSince1970 * 1000))"
    promise.resolve([
      "device": ["id": selectedID, "name": device.name, "adapterId": "lefu-scale", "kind": "scale"],
      "readAt": iso,
      "timeZone": TimeZone.current.identifier,
      "historyDays": 1,
      "skippedRecords": 0,
      "syncVersion": 1,
      "warnings": [],
      "samples": [[
        "sourceRecordId": recordID,
        "metric": "weight",
        "value": weight,
        "unit": "kg",
        "origin": "automatic",
        "recordedAt": iso,
        "localDate": day.string(from: date)
      ]]
    ])
  }

  private func liveMeasurement(weight: Double) {
    guard weight >= 3, weight <= 182.5 else { return }
    progress(38, stage: "scaleUnstable", weight: weight)
  }

  private func handleBluetoothState(_ state: String) {
    if state == "poweredOff" { fail("bluetoothOff") }
    else if state == "permissionDenied" { fail("permissionDenied") }
    else if state == "unavailable" { fail("bluetoothUnavailable") }
  }

  private func handleDevice(_ device: LefuSDKDeviceInfo) {
    devices[device.id] = device
    emit()
  }

  private func handleConnected(_ id: String) {
    guard id == selectedID else { return }
    errorCode = nil
    phase = "connected"
    emit()
  }

  private func handleDisconnected() {
    cancelMeasurement("disconnected")
    selectedID = nil
    if phase != "idle" { phase = "idle" }
    emit()
  }

  private func progress(_ value: Int, stage: String = "history", weight: Double? = nil) {
    guard let requestID = syncRequestID else { return }
    progress(requestID, value: value, stage: stage, weight: weight)
  }

  private func progress(_ requestID: String, value: Int, stage: String = "history", weight: Double? = nil) {
    var payload: [String: Any] = ["requestId": requestID, "stage": stage, "progress": value]
    if let weight {
      payload["value"] = weight
      payload["unit"] = "kg"
    }
    sendEvent("onSyncProgress", payload)
  }

  private func cancelMeasurement(_ code: String) {
    guard let promise = syncPromise else { return }
    syncPromise = nil
    syncRequestID = nil
    syncTimeout?.cancel()
    bridge.stopMeasurement()
    let message = code == "measurementTimeout"
      ? "No completed scale measurement was received"
      : "Scale measurement was cancelled"
    promise.reject(code, message)
  }

  private func fail(_ code: String) {
    cancelMeasurement(code)
    phase = "error"
    errorCode = code
    emit()
  }

  private func cancelPending() {
    guard phase != "connected" else { return }
    bridge.stopScan()
    scanTimeout?.cancel()
    phase = "idle"
    errorCode = nil
    emit()
  }

  private func disconnect() {
    cancelMeasurement("syncCancelled")
    scanTimeout?.cancel()
    bridge.disconnect()
    selectedID = nil
    phase = "idle"
    errorCode = nil
    emit()
  }

  private func snapshot() -> [String: Any] {
    let found: [[String: Any]] = devices.values.map { device in
      ["id": device.id, "name": device.name, "rssi": device.rssi, "adapterId": "lefu-scale", "kind": "scale"]
    }.sorted { ($0["rssi"] as? Int ?? -127) > ($1["rssi"] as? Int ?? -127) }
    var result: [String: Any] = ["phase": phase, "devices": found]
    if let selectedID { result["selectedDeviceId"] = selectedID }
    if let errorCode { result["errorCode"] = errorCode }
    return result
  }

  private func emit() {
    sendEvent("onSnapshot", snapshot())
  }
}

#endif
