const fs = require('node:fs');
const path = require('node:path');
const TARGET_FILES = ['FMDatabase.m', 'FMResultSet.m'];

function fixSource(source) {
  const legacy = /^#import "unistd\.h"\r?$/gm;
  const system = /^#import <unistd\.h>\r?$/gm;
  const legacyCount = [...source.matchAll(legacy)].length;
  const systemCount = [...source.matchAll(system)].length;
  if (legacyCount === 0 && systemCount === 1) return source;
  if (legacyCount !== 1 || systemCount !== 0) {
    throw new Error('Unexpected FMDB source; review the pinned dependency before patching');
  }
  // Keep FMDB's ABI/version and all other code intact. This prevents Xcode's
  // quoted header map resolving unistd.h to React Native's folly/Unistd.h.
  // Upstream: https://github.com/ccgus/fmdb/blob/2.7.12/src/fmdb/FMResultSet.m
  return source.replace('#import "unistd.h"', '#import <unistd.h>');
}

function patchInstalledFmdb(iosRoot) {
  const podsRoot = fs.realpathSync(path.join(iosRoot, 'Pods'));
  const sourceDir = path.join(podsRoot, 'FMDB', 'src', 'fmdb');
  const resolveSource = (name) => {
    const target = fs.realpathSync(path.join(sourceDir, name));
    if (!target.startsWith(podsRoot + path.sep)) {
      throw new Error('Refusing to patch FMDB outside the generated Pods directory');
    }
    return target;
  };
  // Validate BOTH imports before changing either file. The same legacy import
  // exists in FMDatabase.m, not only the FMResultSet.m reported by build #1.
  const patches = TARGET_FILES.map((name) => {
    const target = resolveSource(name);
    const original = fs.readFileSync(target, 'utf8');
    return { target, original, patched: fixSource(original) };
  });
  for (const name of fs.readdirSync(sourceDir, { recursive: true })) {
    if (!/\.(?:h|m|mm|c|cpp)$/i.test(name) || TARGET_FILES.includes(name)) continue;
    const source = fs.readFileSync(resolveSource(name), 'utf8');
    if (/^\s*#\s*(?:import|include)\s*"unistd\.h"/im.test(source)) {
      throw new Error(`Uncovered FMDB system import in ${name}; review before building`);
    }
  }
  let changed = 0;
  for (const { target, original, patched } of patches) {
    if (patched === original) continue;
    const mode = fs.statSync(target).mode;
    try {
      // CocoaPods may make downloaded source files read-only.
      fs.chmodSync(target, mode | 0o200);
      fs.writeFileSync(target, patched, 'utf8');
    } finally {
      fs.chmodSync(target, mode);
    }
    changed++;
  }
  return changed;
}

module.exports = { fixSource, patchInstalledFmdb };
if (require.main === module) {
  try {
    if (!process.argv[2]) throw new Error('Expected the generated iOS project directory');
    const changed = patchInstalledFmdb(path.resolve(process.argv[2]));
    console.log(`[AxMed] FMDB system-header imports verified in ${TARGET_FILES.join(', ')}; ${changed} file(s) patched.`);
  } catch (error) {
    console.error(`[AxMed] ${error.message}`);
    process.exitCode = 1;
  }
}
