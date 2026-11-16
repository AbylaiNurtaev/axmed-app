const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Only these legacy dynamic frameworks are embedded in the app with __LLVM.
// Strip the build worker's copies before CocoaPods signs/copies them. The
// original vendor SDK imported on Windows remains unchanged.
const TARGETS = ['GRDFUSDK', 'ZipZap'];

function hasEmbeddedBitcode(binary) {
  if (binary.length < 8) throw Error('Truncated Mach-O header');
  const magicBE = binary.readUInt32BE(0);
  if (magicBE === 0xcafebabe || magicBE === 0xcafebabf) {
    const is64 = magicBE === 0xcafebabf;
    const count = binary.readUInt32BE(4);
    const entrySize = is64 ? 32 : 20;
    if (!count || count > (binary.length - 8) / entrySize) throw Error('Invalid universal Mach-O header');
    const slices = Array.from({ length: count }, (_, index) => {
      const entry = 8 + index * entrySize;
      const offset = is64 ? Number(binary.readBigUInt64BE(entry + 8)) : binary.readUInt32BE(entry + 8);
      const size = is64 ? Number(binary.readBigUInt64BE(entry + 16)) : binary.readUInt32BE(entry + 12);
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || size < 8 || offset < 8 + count * entrySize || offset + size > binary.length) throw Error('Invalid universal Mach-O slice');
      return hasEmbeddedBitcode(binary.subarray(offset, offset + size));
    });
    return slices.some(Boolean);
  }
  const littleEndian = [0xfeedface, 0xfeedfacf].includes(binary.readUInt32LE(0));
  const magic = littleEndian ? binary.readUInt32LE(0) : magicBE;
  if (![0xfeedface, 0xfeedfacf].includes(magic)) throw Error('Expected an executable Mach-O binary');
  const read32 = offset => littleEndian ? binary.readUInt32LE(offset) : binary.readUInt32BE(offset);
  const headerSize = magic === 0xfeedfacf ? 32 : 28;
  if (binary.length < headerSize) throw Error('Truncated Mach-O header');
  const count = read32(16);
  const commandsEnd = headerSize + read32(20);
  if (commandsEnd > binary.length || count > (commandsEnd - headerSize) / 8) throw Error('Invalid Mach-O load commands');
  let offset = headerSize;
  let containsBitcode = false;
  for (let index = 0; index < count; index++) {
    if (offset + 8 > commandsEnd) throw Error('Truncated Mach-O load command');
    const command = read32(offset);
    const size = read32(offset + 4);
    if (size < 8 || offset + size > commandsEnd) throw Error('Invalid Mach-O load command size');
    if (command === 0x1 || command === 0x19) {
      if (size < 24) throw Error('Truncated Mach-O segment');
      const segment = binary.toString('ascii', offset + 8, offset + 24).replace(/\0.*$/, '');
      containsBitcode ||= segment === '__LLVM';
    }
    offset += size;
  }
  return containsBitcode;
}

function stripHbandBitcode(projectRoot, checkOnly = false) {
  if (process.env.AXMED_HBAND_SIMULATOR_STUB === '1') return;
  const vendorRoot = fs.realpathSync(path.join(projectRoot, 'modules', 'axmed-hband', 'ios', 'Vendor'));
  const targets = TARGETS.map(name => {
    const file = fs.realpathSync(path.join(vendorRoot, `${name}.framework`, name));
    if (!file.startsWith(vendorRoot + path.sep)) throw Error('HBand binary is outside its vendor directory');
    return { name, file, bitcode: hasEmbeddedBitcode(fs.readFileSync(file)) };
  });
  for (const { name, file, bitcode } of targets) {
    if (checkOnly || !bitcode) {
      console.log(`[AxMed] ${name}: ${bitcode ? 'legacy bitcode will be stripped during pod install' : 'no embedded bitcode'}.`);
      continue;
    }
    if (process.platform !== 'darwin') throw Error('Bitcode stripping requires Xcode on the macOS build worker');
    const mode = fs.statSync(file).mode;
    try {
      fs.chmodSync(file, mode | 0o200);
      const result = spawnSync('xcrun', ['bitcode_strip', file, '-r', '-o', file], { encoding: 'utf8' });
      if (result.error || result.status !== 0) throw Error(`${name} bitcode strip failed: ${result.error?.message || result.stderr}`);
      if (hasEmbeddedBitcode(fs.readFileSync(file))) throw Error(`${name} still contains embedded bitcode`);
    } finally {
      fs.chmodSync(file, mode);
    }
    console.log(`[AxMed] ${name}: embedded bitcode removed and verified.`);
  }
}

module.exports = { hasEmbeddedBitcode, stripHbandBitcode };
if (require.main === module) {
  try { stripHbandBitcode(path.resolve(__dirname, '..'), process.argv.includes('--check')); }
  catch (error) { console.error(`[AxMed] ${error.message}`); process.exitCode = 1; }
}
