const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const { hasEmbeddedBitcode } = require('../scripts/strip-hband-bitcode.cjs');
const { addBitcodeStripHook } = require('../plugins/with-hband-bitcode-strip');

function thin(segment, is64 = true, little = true) {
  const headerSize = is64 ? 32 : 28;
  const commandSize = is64 ? 72 : 56;
  const result = Buffer.alloc(headerSize + commandSize);
  const write = (value, offset) => little ? result.writeUInt32LE(value, offset) : result.writeUInt32BE(value, offset);
  write(is64 ? 0xfeedfacf : 0xfeedface, 0);
  write(1, 16);
  write(commandSize, 20);
  write(is64 ? 0x19 : 0x1, headerSize);
  write(commandSize, headerSize + 4);
  result.write(segment, headerSize + 8, 16, 'ascii');
  return result;
}

test('detects __LLVM in 32/64-bit Mach-O with either byte order', () => {
  for (const is64 of [false, true]) for (const little of [false, true]) {
    assert.equal(hasEmbeddedBitcode(thin('__LLVM', is64, little)), true);
    assert.equal(hasEmbeddedBitcode(thin('__TEXT', is64, little)), false);
  }
});

test('checks every architecture in universal binaries', () => {
  const arm32 = thin('__TEXT', false);
  const arm64 = thin('__LLVM');
  const result = Buffer.alloc(48 + arm32.length + arm64.length);
  result.writeUInt32BE(0xcafebabe, 0);
  result.writeUInt32BE(2, 4);
  result.writeUInt32BE(48, 16);
  result.writeUInt32BE(arm32.length, 20);
  result.writeUInt32BE(48 + arm32.length, 36);
  result.writeUInt32BE(arm64.length, 40);
  arm32.copy(result, 48);
  arm64.copy(result, 48 + arm32.length);
  assert.equal(hasEmbeddedBitcode(result), true);
  thin('__TEXT').copy(result, 48 + arm32.length);
  assert.equal(hasEmbeddedBitcode(result), false);
  result.writeUInt32BE(result.length, 36);
  assert.throws(() => hasEmbeddedBitcode(result), /Invalid universal Mach-O slice/);
});

test('rejects malformed binaries and does not mistake string data for a segment', () => {
  assert.throws(() => hasEmbeddedBitcode(Buffer.alloc(4)), /Truncated/);
  const result = thin('__TEXT');
  result.writeUInt32LE(0, 36);
  assert.throws(() => hasEmbeddedBitcode(result), /load command size/);
  assert.equal(hasEmbeddedBitcode(Buffer.concat([thin('__TEXT'), Buffer.from('__LLVM')])), false);
});

test('keeps the native hook idempotent, and finds both actual legacy SDK binaries', () => {
  const podfile = "post_install do |installer|\n  react_native_post_install(installer)\nend\n";
  const patched = addBitcodeStripHook(podfile);
  assert.equal(addBitcodeStripHook(patched), patched);
  assert.ok(patched.includes('react_native_post_install(installer)'));
  for (const name of ['GRDFUSDK', 'ZipZap']) {
    const file = `modules/axmed-hband/ios/Vendor/${name}.framework/${name}`;
    if (fs.existsSync(file)) assert.equal(hasEmbeddedBitcode(fs.readFileSync(file)), true);
  }
});
