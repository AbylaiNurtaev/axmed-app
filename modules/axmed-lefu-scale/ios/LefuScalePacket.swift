import Foundation

struct LefuScalePacket: Equatable {
  let serial: String
  let weightKg: Double?
  let payloadHex: String

  static func parse(_ data: Data) -> LefuScalePacket? {
    let bytes = [UInt8](data)
    guard bytes.count >= 17, bytes[0...2].elementsEqual([0xA8, 0x06, 0x01]) else { return nil }
    guard let serial = String(bytes: bytes[3..<17], encoding: .ascii),
          serial.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }) else { return nil }

    // The bytes following the serial remain identical across different live
    // measurements. They are device metadata, not weight. Real measurements
    // must be read from the authenticated GATT session.
    let weight: Double? = nil
    return LefuScalePacket(
      serial: serial,
      weightKg: weight,
      payloadHex: bytes.map { String(format: "%02X", $0) }.joined()
    )
  }
}
