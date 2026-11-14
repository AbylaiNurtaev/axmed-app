import CoreBluetooth
import Foundation
import PPBluetoothKit

struct LefuSDKDeviceInfo {
  let id: String
  let name: String
  let serial: String
  let rssi: Int
}

private final class RawBLEScanner: NSObject, CBCentralManagerDelegate {
  var onParsedDevice: ((PPBluetoothAdvDeviceModel, CBPeripheral) -> Void)?
  var onConnected: ((CBPeripheral) -> Void)?
  var onConnectFailed: (() -> Void)?
  var onDisconnected: (() -> Void)?
  private var central: CBCentralManager?
  private var scanRequested = false
  private var seen = Set<UUID>()
  private var peripherals: [UUID: CBPeripheral] = [:]

  func start() {
    seen.removeAll()
    scanRequested = true
    if central == nil {
      central = CBCentralManager(
        delegate: self,
        queue: .main,
        options: [CBCentralManagerOptionShowPowerAlertKey: false]
      )
    } else {
      startIfReady()
    }
  }

  func stop() {
    scanRequested = false
    central?.stopScan()
  }

  func owns(_ peripheral: CBPeripheral) -> Bool {
    peripherals[peripheral.identifier] === peripheral
  }

  func connect(_ peripheral: CBPeripheral) {
    stop()
    NSLog("[AxMedScaleRaw] Connecting with fallback central")
    central?.connect(peripheral, options: nil)
  }

  func disconnect(_ peripheral: CBPeripheral) {
    central?.cancelPeripheralConnection(peripheral)
  }

  private func startIfReady() {
    guard scanRequested, central?.state == .poweredOn else { return }
    central?.scanForPeripherals(
      withServices: nil,
      options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
    )
    NSLog("[AxMedScaleRaw] Scanning all BLE advertisements")
  }

  private func makeCF661Fallback(
    advertisementData: [String: Any],
    rssi: NSNumber
  ) -> PPBluetoothAdvDeviceModel {
    let device = PPBluetoothAdvDeviceModel()
    device.fill(withAdvertisementData: advertisementData, andRSSI: rssi)
    device.deviceSettingId = 322
    device.deviceName = "CF661_G"
    device.customDeviceName = "AxMed Scale"
    device.sign = "FF"
    device.deviceConnectType = PPDeviceConnectType(rawValue: 2)!
    device.deviceType = PPDeviceType(rawValue: 1)!
    device.deviceProtocolType = PPDeviceProtocolType(rawValue: 5)!
    device.deviceCalcuteType = PPDeviceCalcuteType(rawValue: 13)!
    device.deviceAccuracyType = PPDeviceAccuracyType(rawValue: 2)!
    device.devicePowerType = PPDevicePowerType(rawValue: 1)!
    device.deviceFuncType = PPDeviceFuncType(rawValue: 327_903)
    device.deviceUnitList = "0,1,2"
    device.macAddressStart = 6
    device.advLength = 19
    device.productModel = "CF661"
    device.standardType = PPStandardType(rawValue: 0)!
    device.avatarType = PPAvatarTypeType(rawValue: 0)!
    device.sdkCode = 0
    device.peripheralType = PPDevicePeripheralType(rawValue: 12)!
    return device
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    NSLog("[AxMedScaleRaw] Bluetooth state: \(central.state.rawValue)")
    startIfReady()
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    guard seen.insert(peripheral.identifier).inserted else { return }
    peripherals[peripheral.identifier] = peripheral
    let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
    let name = localName ?? peripheral.name ?? "<unnamed>"
    let manufacturer = (advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data)?
      .map { String(format: "%02X", $0) }
      .joined() ?? "-"
    let services = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])?
      .map(\.uuidString)
      .joined(separator: ",") ?? "-"
    NSLog(
      "[AxMedScaleRaw] name=\(name) id=\(peripheral.identifier.uuidString) " +
      "rssi=\(RSSI.intValue) manufacturer=\(manufacturer) services=\(services)"
    )
    if let manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data {
      var device = PPBluetoothAdvDeviceModel.filterDeviceTypeAdvModel(
         byCBAdvDataManufacturerData: manufacturerData,
         andDeivceName: name,
         rssi: RSSI
       )
      device.fill(withAdvertisementData: advertisementData, andRSSI: RSSI)
      if device.deviceName.isEmpty, name == "CF661_G", manufacturerData.count == 19 {
        device = makeCF661Fallback(advertisementData: advertisementData, rssi: RSSI)
        NSLog("[AxMedScaleRaw] Applied CF661_G Borre fallback")
      }
      if !device.deviceName.isEmpty {
        NSLog("[AxMedScaleRaw] LEFU parser accepted \(name) as protocol \(device.deviceProtocolType.rawValue)")
        onParsedDevice?(device, peripheral)
      }
    }
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    NSLog("[AxMedScaleRaw] Connected \(peripheral.identifier.uuidString)")
    onConnected?(peripheral)
  }

  func centralManager(
    _ central: CBCentralManager,
    didFailToConnect peripheral: CBPeripheral,
    error: (any Error)?
  ) {
    NSLog("[AxMedScaleRaw] Failed to connect: \(error?.localizedDescription ?? "unknown")")
    onConnectFailed?()
  }

  func centralManager(
    _ central: CBCentralManager,
    didDisconnectPeripheral peripheral: CBPeripheral,
    error: (any Error)?
  ) {
    NSLog("[AxMedScaleRaw] Disconnected \(peripheral.identifier.uuidString)")
    onDisconnected?()
  }
}

final class LefuSDKBridge: NSObject {
  var onState: ((String) -> Void)?
  var onDevice: ((LefuSDKDeviceInfo) -> Void)?
  var onConnected: ((String) -> Void)?
  var onDisconnected: (() -> Void)?
  var onLiveWeight: ((Double) -> Void)?
  var onWeight: ((Double, Date) -> Void)?
  var onError: ((String) -> Void)?

  private var manager = PPBluetoothConnectManager()
  private var devices: [String: (PPBluetoothAdvDeviceModel, CBPeripheral)] = [:]
  private let diagnosticScanner = RawBLEScanner()
  private var currentID: String?
  private var currentDevice: PPBluetoothAdvDeviceModel?
  private var catalogLoaded = false
  private var keepAliveTimer: Timer?
  private var lastCompositionSignature = ""

  private var apple: PPBluetoothPeripheralApple?
  private var coconut: PPBluetoothPeripheralCoconut?
  private var torre: PPBluetoothPeripheralTorre?
  private var ice: PPBluetoothPeripheralIce?
  private var borre: PPBluetoothPeripheralBorre?
  private var forre: PPBluetoothPeripheralForre?
  private var dorre: PPBluetoothPeripheralDorre?

  override init() {
    super.init()
    diagnosticScanner.onParsedDevice = { [weak self] device, peripheral in
      self?.capture(device, peripheral: peripheral)
    }
    diagnosticScanner.onConnected = { [weak self] _ in self?.beginServiceDiscovery() }
    diagnosticScanner.onConnectFailed = { [weak self] in self?.onError?("scaleConnectFailed") }
    diagnosticScanner.onDisconnected = { [weak self] in
      self?.clearControllers()
      self?.onDisconnected?()
    }
    loadDeviceCatalog()
    resetManager()
  }

  func startScan() {
    guard catalogLoaded else {
      NSLog("[AxMedScale] Cannot scan: LEFU device catalog is missing")
      onError?("scaleCatalogMissing")
      return
    }
    NSLog("[AxMedScale] Starting LEFU scan")
    disconnect()
    devices.removeAll()
    diagnosticScanner.start()
    resetManager()
    manager.searchSurroundDevice()
  }

  func stopScan() {
    NSLog("[AxMedScale] Stopping LEFU scan")
    diagnosticScanner.stop()
    manager.stopSearch()
  }

  func connect(id: String) {
    guard let (device, peripheral) = devices[id] else {
      onError?("deviceNotFound")
      return
    }
    manager.stopSearch()
    NSLog("[AxMedScale] Connecting to \(device.deviceName) (\(id))")
    currentID = id
    currentDevice = device
    manager.connectDelegate = self

    switch device.peripheralType {
    case .peripheralApple:
      apple = PPBluetoothPeripheralApple(peripheral: peripheral, andDevice: device)
      apple?.serviceDelegate = self
    case .peripheralCoconut:
      coconut = PPBluetoothPeripheralCoconut(peripheral: peripheral, andDevice: device)
      coconut?.serviceDelegate = self
    case .peripheralTorre:
      torre = PPBluetoothPeripheralTorre(peripheral: peripheral, andDevice: device)
      torre?.serviceDelegate = self
    case .peripheralIce:
      ice = PPBluetoothPeripheralIce(peripheral: peripheral, andDevice: device)
      ice?.serviceDelegate = self
    case .peripheralBorre:
      borre = PPBluetoothPeripheralBorre(peripheral: peripheral, andDevice: device)
      borre?.serviceDelegate = self
    case .peripheralForre:
      forre = PPBluetoothPeripheralForre(peripheral: peripheral, andDevice: device)
      forre?.serviceDelegate = self
    case .peripheralDorre:
      dorre = PPBluetoothPeripheralDorre(peripheral: peripheral, andDevice: device)
      dorre?.serviceDelegate = self
    default:
      onError?("unsupportedScaleProtocol")
      return
    }
    if diagnosticScanner.owns(peripheral) {
      diagnosticScanner.connect(peripheral)
    } else {
      manager.connect(peripheral, withDevice: device)
    }
  }

  func disconnect() {
    manager.stopSearch()
    if let currentID, let peripheral = devices[currentID]?.1 {
      if diagnosticScanner.owns(peripheral) {
        diagnosticScanner.disconnect(peripheral)
      } else {
        manager.disconnect(peripheral)
      }
    }
    clearControllers()
  }

  func startMeasurement() {
    let handler: (Int) -> Void = { [weak self] status in
      NSLog("[AxMedScale] Start measurement status: \(status)")
      if status != 0 { self?.onError?("scaleMeasureStartFailed") }
    }
    switch currentDevice?.peripheralType {
    case .peripheralTorre: torre?.codeStartMeasure(handler)
    case .peripheralBorre: borre?.codeStartMeasure(handler)
    case .peripheralForre: forre?.codeStartMeasure(handler)
    case .peripheralDorre: dorre?.codeStartMeasure(handler)
    default: break
    }
  }

  func stopMeasurement() {
    let handler: (Int) -> Void = { status in
      NSLog("[AxMedScale] Stop measurement status: \(status)")
    }
    switch currentDevice?.peripheralType {
    case .peripheralTorre: torre?.codeStopMeasure(handler)
    case .peripheralBorre: borre?.codeStopMeasure(handler)
    case .peripheralForre: forre?.codeStopMeasure(handler)
    case .peripheralDorre: dorre?.codeStopMeasure(handler)
    default: break
    }
  }

  private func resetManager() {
    manager = PPBluetoothConnectManager()
    manager.updateStateDelegate = self
    manager.surroundDeviceDelegate = self
  }

  private func loadDeviceCatalog() {
    let bundles = [Bundle(for: LefuSDKBridge.self), Bundle.main]
    guard let url = bundles.compactMap({ $0.url(forResource: "Device", withExtension: "json") }).first,
          let data = try? Data(contentsOf: url),
          let catalog = try? JSONSerialization.jsonObject(with: data) as? [Any] else {
      return
    }
    PPBluetoothManager.loadDevice(withJsonData: catalog)
    catalogLoaded = true
    NSLog("[AxMedScale] Loaded \(catalog.count) LEFU device definitions from \(url.lastPathComponent)")
  }

  private func clearControllers() {
    keepAliveTimer?.invalidate()
    keepAliveTimer = nil
    currentID = nil
    currentDevice = nil
    apple = nil
    coconut = nil
    torre = nil
    ice = nil
    borre = nil
    forre = nil
    dorre = nil
  }

  private func sendKeepAlive() {
    switch currentDevice?.peripheralType {
    case .peripheralTorre: torre?.sendKeepAliveCode()
    case .peripheralIce: ice?.sendKeepAliveCode()
    case .peripheralBorre: borre?.sendKeepAliveCode()
    case .peripheralForre: forre?.sendKeepAliveCode()
    case .peripheralDorre: dorre?.sendKeepAliveCode()
    default: break
    }
  }

  private func startKeepAlive() {
    keepAliveTimer?.invalidate()
    sendKeepAlive()
    keepAliveTimer = Timer.scheduledTimer(withTimeInterval: 8, repeats: true) { [weak self] _ in
      self?.sendKeepAlive()
    }
  }

  private func logMeasurement(_ kind: String, model: PPBluetoothScaleBaseModel) {
    let composition = [
      model.impedance,
      model.impedance100EnCode,
      model.heartRate,
      model.z20KhzLeftArmEnCode,
      model.z20KhzRightArmEnCode,
      model.z20KhzLeftLegEnCode,
      model.z20KhzRightLegEnCode,
      model.z20KhzTrunkEnCode,
      model.z100KhzLeftArmEnCode,
      model.z100KhzRightArmEnCode,
      model.z100KhzLeftLegEnCode,
      model.z100KhzRightLegEnCode,
      model.z100KhzTrunkEnCode,
      model.batteryVoltage
    ].map(String.init).joined(separator: ",")
    if kind == "process", composition == lastCompositionSignature { return }
    lastCompositionSignature = composition
    NSLog(
      "[AxMedScaleData] kind=\(kind) weight=\(Double(model.weight) / 100.0) " +
      "heartRate=\(model.heartRate) impedance=\(model.impedance) impedance100=\(model.impedance100EnCode) " +
      "z20=[LA:\(model.z20KhzLeftArmEnCode),RA:\(model.z20KhzRightArmEnCode)," +
      "LL:\(model.z20KhzLeftLegEnCode),RL:\(model.z20KhzRightLegEnCode),T:\(model.z20KhzTrunkEnCode)] " +
      "z100=[LA:\(model.z100KhzLeftArmEnCode),RA:\(model.z100KhzRightArmEnCode)," +
      "LL:\(model.z100KhzLeftLegEnCode),RL:\(model.z100KhzRightLegEnCode),T:\(model.z100KhzTrunkEnCode)] " +
      "batteryVoltage=\(model.batteryVoltage) unit=\(model.unit.rawValue) " +
      "end=\(model.isEnd) fatting=\(model.isFatting) heartRating=\(model.isHeartRating) " +
      "overload=\(model.isOverload) date=\(model.dateStr)"
    )
  }

  private func capture(_ device: PPBluetoothAdvDeviceModel, peripheral: CBPeripheral) {
    let id = peripheral.identifier.uuidString
    NSLog(
      "[AxMedScale] Discovered name=\(device.deviceName) custom=\(device.customDeviceName) " +
      "id=\(id) rssi=\(device.rssi) protocol=\(device.deviceProtocolType.rawValue) " +
      "peripheralType=\(device.peripheralType.rawValue)"
    )
    devices[id] = (device, peripheral)
    let advertisedName = device.customDeviceName.isEmpty ? device.deviceName : device.customDeviceName
    onDevice?(LefuSDKDeviceInfo(
      id: id,
      name: advertisedName.isEmpty ? "AxMed Scale" : advertisedName,
      serial: device.deviceMac,
      rssi: device.rssi
    ))
  }

  private func beginServiceDiscovery() {
    switch currentDevice?.peripheralType {
    case .peripheralApple:
      apple?.discoverDeviceInfoService { [weak self] _ in self?.apple?.discoverFFF0Service() }
    case .peripheralCoconut: coconut?.discoverFFF0Service()
    case .peripheralTorre: torre?.discoverFFF0Service()
    case .peripheralIce: ice?.discoverFFF0Service()
    case .peripheralBorre: borre?.discoverFFF0Service()
    case .peripheralForre: forre?.discoverFFF0Service()
    case .peripheralDorre: dorre?.discoverFFF0Service()
    default: onError?("unsupportedScaleProtocol")
    }
  }

  private func activateMeasurementDelegate() {
    switch currentDevice?.peripheralType {
    case .peripheralApple: apple?.scaleDataDelegate = self
    case .peripheralCoconut: coconut?.scaleDataDelegate = self
    case .peripheralTorre:
      torre?.codeUpdateMTU { [weak self] _ in self?.torre?.scaleDataDelegate = self }
    case .peripheralIce: ice?.scaleDataDelegate = self
    case .peripheralBorre:
      borre?.codeUpdateMTU { [weak self] _ in self?.borre?.scaleDataDelegate = self }
    case .peripheralForre:
      forre?.codeUpdateMTU { [weak self] _ in self?.forre?.scaleDataDelegate = self }
    case .peripheralDorre:
      dorre?.codeUpdateMTU { [weak self] _ in self?.dorre?.scaleDataDelegate = self }
    default: onError?("unsupportedScaleProtocol")
    }
    startKeepAlive()
    if let currentID { onConnected?(currentID) }
  }
}

extension LefuSDKBridge: PPBluetoothUpdateStateDelegate, PPBluetoothSurroundDeviceDelegate {
  func centralManagerDidUpdate(_ state: PPBluetoothState) {
    NSLog("[AxMedScale] Bluetooth state: \(state.rawValue)")
    switch state {
    case .poweredOn: onState?("poweredOn")
    case .poweredOff: onState?("poweredOff")
    case .unauthorized: onState?("permissionDenied")
    case .unsupported: onState?("unavailable")
    default: onState?("unavailable")
    }
  }

  func centralManagerDidFoundSurroundDevice(_ device: PPBluetoothAdvDeviceModel!, andPeripheral peripheral: CBPeripheral!) {
    guard let device, let peripheral else { return }
    capture(device, peripheral: peripheral)
  }
}

extension LefuSDKBridge: PPBluetoothConnectDelegate {
  func centralManagerDidConnect() {
    beginServiceDiscovery()
  }

  func centralManagerDidFail(toConnect error: (any Error)!) {
    onError?("scaleConnectFailed")
  }

  func centralManagerDidDisconnect() {
    clearControllers()
    onDisconnected?()
  }
}

extension LefuSDKBridge: PPBluetoothServiceDelegate {
  func discoverFFF0ServiceSuccess() {
    NSLog("[AxMedScale] Borre service discovery succeeded")
    activateMeasurementDelegate()
  }
}

extension LefuSDKBridge: PPBluetoothScaleDataDelegate {
  func monitorProcessData(_ model: PPBluetoothScaleBaseModel!, advModel: PPBluetoothAdvDeviceModel!) {
    guard let model, model.weight > 0 else { return }
    logMeasurement("process", model: model)
    let weight = Double(model.weight) / 100.0
    NSLog("[AxMedScale] Live weight: \(weight) kg")
    onLiveWeight?(weight)
  }

  func monitorLockData(_ model: PPBluetoothScaleBaseModel!, advModel: PPBluetoothAdvDeviceModel!) {
    guard let model, model.weight > 0 else { return }
    logMeasurement("lock", model: model)
    NSLog("[AxMedScale] Locked weight: \(Double(model.weight) / 100.0) kg")
    onWeight?(Double(model.weight) / 100.0, Date())
  }

  func monitorScaleState(_ scaleState: PPScaleState!) {
    guard let scaleState else { return }
    NSLog(
      "[AxMedScaleState] weight=\(scaleState.weightType.rawValue) " +
      "impedance=\(scaleState.impedanceType.rawValue) heartRate=\(scaleState.heartRateType.rawValue) " +
      "result=\(scaleState.measureResultType.rawValue) mode=\(scaleState.measureModeType.rawValue) " +
      "power=\(scaleState.powerType.rawValue)"
    )
  }
}
