import Foundation

func require(_ condition: @autoclosure () -> Bool, _ message: String) {
  guard condition() else {
    fputs("FAIL: \(message)\n", stderr)
    exit(1)
  }
}

let measurement = Data([
  0xA8, 0x06, 0x01,
  0x30, 0x30, 0x30, 0x30, 0x30, 0x51, 0x31, 0x42, 0x41, 0x43, 0x43, 0x37, 0x35, 0x32,
  0x01, 0x41, 0x1C, 0x32, 0x53, 0xC7, 0x8A, 0xF8, 0x89, 0xBC, 0x00
])
let parsed = LefuScalePacket.parse(measurement)
require(parsed?.serial == "00000Q1BACC752", "serial must be decoded from the captured advertisement")
require(parsed?.weightKg == nil, "manufacturer metadata must not be decoded as weight")

let idle = measurement.prefix(17)
require(LefuScalePacket.parse(Data(idle))?.weightKg == nil, "an idle advertisement must not fabricate a weight")
require(LefuScalePacket.parse(Data([0xA8, 0x06])) == nil, "a truncated packet must be rejected")
require(LefuScalePacket.parse(Data(repeating: 0, count: 28)) == nil, "another manufacturer must be rejected")

print("LEFU scale packet tests passed")
