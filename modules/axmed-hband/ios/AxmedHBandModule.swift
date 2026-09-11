import CoreBluetooth
import ExpoModulesCore
import VeepooBleSDK

// Foreground-only MVP. All SDK access and mutable state are confined to main.
// Veepoo owns the CBCentralManager delegate; never replace it or mix scan APIs.
public class AxmedHBandModule: Module {
  private var manager: VPBleCentralManage?
  private var devices: [String: VPPeripheralModel] = [:]
  private var phase = "idle"
  private var selectedID: String?
  private var errorCode: String?
  private var scanRequested = false
  private var generation = 0
  private var timeout: DispatchWorkItem?
  private var syncPromise: Promise?
  private var syncID: String?
  private var syncTimeout: DispatchWorkItem?
  private var syncStartedAt = Date()
  private var syncBattery: [String: Any]?
  private var syncStage = ""
  private var syncDays = 1
  private var syncChannels = Set<String>()
  private var syncWarnings = Set<String>()
  private var syncActivity: [String: [String: Any]] = [:]
  private var syncManual: VPManualTestDataModel?

  public func definition() -> ModuleDefinition {
    Name("AxmedHBand")
    Events("onSnapshot", "onSyncProgress")

    AsyncFunction("getSnapshot") { self.snapshot() }.runOnQueue(.main)
    AsyncFunction("startScan") { self.startScan() }.runOnQueue(.main)
    AsyncFunction("connect") { (id: String) in self.connect(id) }.runOnQueue(.main)
    AsyncFunction("cancelPending") { self.cancelPending() }.runOnQueue(.main)
    AsyncFunction("disconnect") { self.disconnect() }.runOnQueue(.main)
    AsyncFunction("syncData") { (requestID: String, promise: Promise) in
      self.syncData(requestID, promise: promise)
    }.runOnQueue(.main)

    OnAppEntersBackground {
      DispatchQueue.main.async {
        // There is no documented SDK cancellation command: disconnect to stop I/O.
        if self.syncPromise != nil { self.fail("syncInterrupted") }
        else { self.cancelPending() }
      }
    }
    OnAppBecomesActive {
      DispatchQueue.main.async {
        if self.phase == "connected", self.manager?.peripheralModel?.peripheral?.state != .connected {
          self.fail("disconnected")
        }
      }
    }
    OnDestroy {
      DispatchQueue.main.async {
        self.disconnect()
        self.manager?.vpBleCentralManageChangeBlock = nil
        self.manager?.vpBleConnectStateChangeBlock = nil
      }
    }
  }

  private func initializeSDK() {
    guard manager == nil else { return }
    let sdk = VPBleCentralManage.sharedBleManager()!
    manager = sdk
    sdk.isLogEnable = false
    sdk.automaticConnection = false
    sdk.isAutoConnectBT = false // No Bluetooth calling/audio setup.
    sdk.systemLanguage = false
    sdk.connectionTimeout = 30
    sdk.deviceConfirmTimeout = 15
    sdk.peripheralManage = VPPeripheralManage.shareVPPeripheralManager()
    sdk.vpBleCentralManageChangeBlock = { [weak self] state in
      DispatchQueue.main.async { self?.bluetoothChanged(Int(state.rawValue)) }
    }
    sdk.vpBleConnectStateChangeBlock = { [weak self] state in
      DispatchQueue.main.async {
        // VPDeviceConnectStateDisConnect == 0 (VPPublicDefine.h).
        if state.rawValue == 0, self?.phase == "connected" {
          self?.fail("disconnected")
        }
      }
    }
  }

  private func startScan() {
    guard phase != "connected", phase != "connecting", phase != "verifying" else { return }
    cancelPending()
    devices.removeAll()
    selectedID = nil
    errorCode = nil
    phase = "requestingPermission"
    scanRequested = true
    emit()
    // Creating the SDK central manager triggers the system permission prompt,
    // only after the user explicitly presses Find.
    initializeSDK()
    bluetoothChanged(Int(manager?.centralManager?.state.rawValue ?? 0))
  }

  private func bluetoothChanged(_ state: Int) {
    if state == 5 { // PoweredOn; SDK and CoreBluetooth enums share these values.
      if scanRequested, phase != "scanning" { beginScan() }
      return
    }
    let code: String
    switch state {
    case 2: code = "bluetoothUnsupported"
    case 3: code = "permissionDenied"
    case 4: code = "bluetoothOff"
    default:
      // Bluetooth can briefly become unknown/resetting. Do not retain a ready state.
      if phase == "connected" || phase == "connecting" || phase == "verifying" {
        fail("bluetoothUnavailable")
      }
      return
    }
    if scanRequested || ["scanning", "connecting", "verifying", "connected"].contains(phase) {
      fail(code)
    }
  }

  private func beginScan() {
    guard let manager else { return }
    generation += 1
    let token = generation
    phase = "scanning"
    emit()
    manager.veepooSDKStartScanDeviceAndReceiveScanningDevice { [weak self] device in
      DispatchQueue.main.async {
        guard let self, self.generation == token, self.phase == "scanning",
              let device, let peripheral = device.peripheral else { return }
        let id = peripheral.identifier.uuidString
        // Use the iOS peripheral UUID, not the vendor address which can change at handshake.
        guard self.devices[id] != nil || self.devices.count < 64 else { return }
        self.devices[id] = device
        self.emit()
      }
    }
    setTimeout(seconds: 12) { [weak self] in
      guard let self, self.generation == token else { return }
      self.generation += 1
      self.scanRequested = false
      self.manager?.veepooSDKStopScanDevice()
      self.phase = "idle"
      self.emit()
    }
  }

  private func connect(_ id: String) {
    guard phase == "idle" || phase == "scanning" || phase == "error" else { return }
    guard let manager, let device = devices[id] else { fail("deviceNotFound"); return }
    guard manager.centralManager?.state == .poweredOn else { fail("bluetoothOff"); return }
    generation += 1
    let token = generation
    timeout?.cancel()
    scanRequested = false
    manager.veepooSDKStopScanDevice()
    selectedID = id
    errorCode = nil
    phase = "connecting"
    emit()
    setTimeout(seconds: 45) { [weak self] in
      guard let self, self.generation == token else { return }
      self.fail("connectionTimeout")
    }
    manager.veepooSDKConnectDevice(device) { [weak self] state in
      DispatchQueue.main.async {
        guard let self, self.generation == token else { return }
        switch state {
        case .BleConnecting: self.phase = "connecting"; self.emit()
        case .BleConnectSuccess: self.phase = "verifying"; self.emit()
        case .BleVerifyPasswordSuccess:
          self.generation += 1 // Ignore late handshake/timeout callbacks after readiness.
          self.timeout?.cancel()
          self.phase = "connected"
          self.emit()
        case .BlePoweredOff: self.fail("bluetoothOff")
        case .BleVerifyPasswordFailure: self.fail("verificationFailed")
        case .BleConnectTimeout: self.fail("connectionTimeout")
        case .BleConfirmTimeout: self.fail("confirmationTimeout")
        case .BleConnectFailed: self.fail("connectionFailed")
        @unknown default: self.fail("connectionFailed")
        }
      }
    }
  }

  private func fail(_ code: String) {
    rejectSync(code)
    generation += 1
    timeout?.cancel()
    scanRequested = false
    phase = "error"
    errorCode = code
    selectedID = nil
    manager?.veepooSDKStopScanDevice()
    manager?.veepooSDKDisconnectDevice()
    emit()
  }

  private func cancelPending() {
    // Navigating forward preserves an established connection. No data sync starts here.
    guard phase != "connected" else { return }
    generation += 1
    timeout?.cancel()
    scanRequested = false
    let wasConnecting = phase == "connecting" || phase == "verifying"
    phase = "idle"
    selectedID = nil
    errorCode = nil
    manager?.veepooSDKStopScanDevice()
    if wasConnecting { manager?.veepooSDKDisconnectDevice() }
    emit()
  }

  private func disconnect() {
    rejectSync("syncCancelled")
    generation += 1
    timeout?.cancel()
    scanRequested = false
    phase = "idle"
    selectedID = nil
    errorCode = nil
    manager?.veepooSDKStopScanDevice()
    manager?.veepooSDKDisconnectDevice()
    emit()
  }

  private func setTimeout(seconds: Double, action: @escaping () -> Void) {
    timeout?.cancel()
    let work = DispatchWorkItem(block: action)
    timeout = work
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
  }

  private func snapshot() -> [String: Any] {
    let found: [[String: Any]] = devices.map { id, device in
      ["id": id, "name": device.deviceName ?? "Браслет", "rssi": device.rssi?.intValue ?? -127,
       "adapterId": "hband", "kind": "fitness-band"]
    }.sorted { ($0["rssi"] as? Int ?? -127) > ($1["rssi"] as? Int ?? -127) }
    var result: [String: Any] = ["phase": phase, "devices": found]
    if let errorCode { result["errorCode"] = errorCode }
    if let selectedID { result["selectedDeviceId"] = selectedID }
    return result
  }

  private func emit() { sendEvent("onSnapshot", snapshot()) }

  private func syncData(_ requestID: String, promise: Promise) {
    guard syncPromise == nil else { promise.reject("syncBusy", "Synchronization is already running"); return }
    guard phase == "connected", let manager, let peripheral = manager.peripheralManage,
          let device = manager.peripheralModel, device.peripheral?.state == .connected,
          let selectedID, device.peripheral?.identifier.uuidString == selectedID,
          let address = device.deviceAddress, !address.isEmpty else {
      promise.reject("disconnected", "Connect a bracelet first"); return
    }
    syncPromise = promise
    syncID = requestID
    syncStartedAt = Date()
    syncBattery = nil
    syncChannels = []
    syncWarnings = []
    syncActivity = [:]
    syncManual = nil
    syncStage = "battery"
    syncProgress(requestID, stage: "battery", progress: 0)
    armSyncTimeout(20, requestID: requestID)
    peripheral.veepooSDKReadDeviceBatteryInfo { [weak self] isPercent, isLow, value in
      DispatchQueue.main.async {
        guard let self, self.syncID == requestID, self.syncStage == "battery" else { return }
        if value <= (isPercent ? 100 : 4) {
          self.syncBattery = ["value": Int(value), "unit": isPercent ? "percent" : "bars",
                              "low": isPercent ? isLow : value == 0]
        }
        self.readHistory(requestID, device: device)
      }
    }
  }

  private func readHistory(_ requestID: String, device: VPPeripheralModel) {
    guard syncID == requestID, let peripheral = manager?.peripheralManage else { return }
    syncStage = "history"
    syncProgress(requestID, stage: "history", progress: 0)
    // Absolute deadline, not reset by progress: a stuck SDK cannot spin forever.
    armSyncTimeout(180, requestID: requestID)
    peripheral.veepooSdkStartReadDeviceAllData { [weak self] state, totalDays, currentDay, dayProgress in
      DispatchQueue.main.async {
        guard let self, self.syncID == requestID, self.syncStage == "history", self.phase == "connected" else { return }
        switch state {
        case .start: self.syncProgress(requestID, stage: "history", progress: 0)
        case .reading:
          let days = max(1, Int(totalDays))
          let completed = max(0, Int(currentDay) - 1)
          let progress = min(99, (completed * 100 + min(100, Int(dayProgress))) / days)
          self.syncProgress(requestID, stage: "history", progress: progress)
        case .complete:
          self.syncTimeout?.cancel()
          self.syncDays = min(7, max(1, Int(totalDays)))
          // New firmware includes oxygen/HRV in the base read. Older firmware
          // needs their separate commands, as in the vendor demo. No parallel BLE.
          if device.oxygenType != 0 { self.syncChannels.insert("oxygen") }
          if device.hrvType != 0 { self.syncChannels.insert("hrv") }
          if device.temperatureType == 5 { self.syncChannels.insert("temperature") }
          var jobs: [String] = []
          if device.oxygenType != 0 { jobs.append("oxygen") }
          if device.hrvType != 0 { jobs.append("hrv") }
          if device.temperatureType == 2 || device.temperatureType == 4 { jobs.append("temperature") }
          self.readAdditional(requestID, device: device, jobs: jobs)
        default: self.fail("syncUnsupported")
        }
      }
    }
  }

  private func readAdditional(_ requestID: String, device: VPPeripheralModel, jobs: [String]) {
    guard syncID == requestID, let peripheral = manager?.peripheralManage else { return }
    guard let stage = jobs.first else { readManual(requestID, device: device); return }
    syncStage = stage
    syncProgress(requestID, stage: stage, progress: 0)
    armSyncTimeout(120, requestID: requestID)
    let callback: (VPReadDeviceBaseDataState, UInt, UInt, UInt) -> Void = { [weak self] state, days, day, progress in
      DispatchQueue.main.async {
        guard let self, self.syncID == requestID, self.syncStage == stage, self.phase == "connected" else { return }
        switch state {
        case .start: self.syncProgress(requestID, stage: stage, progress: 0)
        case .reading:
          let percent = (max(0, Int(day) - 1) * 100 + min(100, Int(progress))) / max(1, Int(days))
          self.syncProgress(requestID, stage: stage, progress: min(99, percent))
        case .complete:
          self.syncChannels.insert(stage)
          self.readAdditional(requestID, device: device, jobs: Array(jobs.dropFirst()))
        default:
          self.syncWarnings.insert(stage + "Unavailable")
          self.readAdditional(requestID, device: device, jobs: Array(jobs.dropFirst()))
        }
      }
    }
    switch stage {
    case "oxygen": peripheral.veepooSdkStartReadDeviceOxygenData(callback)
    case "hrv": peripheral.veepooSdkStartReadDeviceHrvData(callback)
    default: peripheral.veepooSdkStartReadDeviceTemperatureData(callback)
    }
  }

  private func readManual(_ requestID: String, device: VPPeripheralModel) {
    guard syncID == requestID, let peripheral = manager?.peripheralManage else { return }
    let wanted: VPManualTestDataType = [.heartRate, .bloodPressure, .bloodOxygen, .temperature, .HRV, .met, .stress]
    let supported = wanted.intersection(peripheral.supportManualTestType)
    guard !supported.isEmpty else { readActivity(requestID, device: device, offset: 0); return }
    syncStage = "manual"
    syncProgress(requestID, stage: "manual", progress: 0)
    armSyncTimeout(45, requestID: requestID)
    let since = UInt32(max(0, syncStartedAt.timeIntervalSince1970 - 7 * 86400))
    peripheral.readManualTestData(withTimestamp: since, dataType: supported) { [weak self] model in
      DispatchQueue.main.async {
        guard let self, self.syncID == requestID, self.syncStage == "manual" else { return }
        // Some firmware leaves this optional attribution empty; the request is
        // already bound to the verified peripheral and guarded by syncID.
        if let model, model.mac.isEmpty || model.mac.caseInsensitiveCompare(device.deviceAddress ?? "") == .orderedSame {
          self.syncManual = model
        } else if model != nil { self.syncWarnings.insert("manualDeviceMismatch") }
        self.readActivity(requestID, device: device, offset: 0)
      }
    }
  }

  private func readActivity(_ requestID: String, device: VPPeripheralModel, offset: Int) {
    guard syncID == requestID else { return }
    syncStage = "activity\(offset)"
    if offset >= syncDays { finishSync(requestID, device: device); return }
    guard (30...250).contains(device.deviceStature) else {
      syncWarnings.insert("activityProfileMissing")
      finishSync(requestID, device: device); return
    }
    let builder = HBandSampleBuilder(referenceDate: syncStartedAt)
    guard let date = builder.calendar.date(byAdding: .day, value: -offset, to: syncStartedAt) else { return }
    let day = builder.day(date)
    syncProgress(requestID, stage: "activity", progress: offset * 100 / syncDays)
    armSyncTimeout(20, requestID: requestID)
    VPDataBaseOperation.veepooSDKGetStepData(withDate: day, andTableID: device.deviceAddress,
                                            changeUserStature: device.deviceStature) { [weak self] totals in
      DispatchQueue.main.async {
        guard let self, self.syncID == requestID, self.syncStage == "activity\(offset)" else { return }
        if let totals = totals as? [String: Any] { self.syncActivity[day] = totals }
        self.readActivity(requestID, device: device, offset: offset + 1)
      }
    }
  }

  private func finishSync(_ requestID: String, device: VPPeripheralModel) {
    guard syncID == requestID, phase == "connected" else { return }
    syncStage = "complete"
    syncTimeout?.cancel()
    let result = HBandHistoryReader.read(device: device, referenceDate: syncStartedAt, days: syncDays,
      channels: syncChannels, activity: syncActivity, manual: syncManual)
    var batch: [String: Any] = [
      "device": ["id": selectedID ?? "", "name": device.deviceName ?? "Браслет", "adapterId": "hband", "kind": "fitness-band"],
      "readAt": ISO8601DateFormatter().string(from: Date()), "timeZone": TimeZone.current.identifier,
      "samples": result.samples, "skippedRecords": result.skipped, "historyDays": syncDays,
      "syncVersion": 2, "warnings": Array(syncWarnings.union(result.warnings)).sorted()
    ]
    if let battery = syncBattery { batch["battery"] = battery }
    let promise = syncPromise
    syncPromise = nil; syncID = nil; syncBattery = nil; syncManual = nil; syncActivity = [:]
    syncProgress(requestID, stage: "complete", progress: 100)
    promise?.resolve(batch)
  }

  private func armSyncTimeout(_ seconds: Double, requestID: String) {
    syncTimeout?.cancel()
    let work = DispatchWorkItem { [weak self] in
      guard let self, self.syncID == requestID else { return }
      self.fail("syncTimeout")
    }
    syncTimeout = work
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
  }

  private func rejectSync(_ code: String) {
    syncTimeout?.cancel()
    let promise = syncPromise
    syncPromise = nil
    syncID = nil
    syncBattery = nil
    syncManual = nil
    syncActivity = [:]
    syncStage = ""
    promise?.reject(code, "Bracelet synchronization stopped")
  }

  private func syncProgress(_ requestID: String, stage: String, progress: Int) {
    sendEvent("onSyncProgress", ["requestId": requestID, "stage": stage, "progress": progress])
  }
}
