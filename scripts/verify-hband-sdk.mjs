import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleRoot = path.join(root, 'modules', 'axmed-hband');
const manifest = JSON.parse(readFileSync(path.join(moduleRoot, 'vendor-manifest.json'), 'utf8'));
const config = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
assert.equal(config.owner, 'axmed-project', 'Refusing a configuration targeting the personal EAS account');
assert.equal(config.extra?.eas?.projectId, 'ca415684-7238-461a-bb54-0764d41b6672');
assert.equal(config.ios?.appleTeamId, 'SAZ93YMRD7', 'Apple team must match the verified AxMed owner');
assert.equal(config.ios?.bundleIdentifier, 'com.anonymous.pochka2new', 'Bundle ID must match AxMed in App Store Connect');
assert.ok(config.ios?.infoPlist?.NSBluetoothAlwaysUsageDescription, 'Bluetooth permission description missing');
assert.ok(config.plugins.includes('./plugins/with-fmdb-system-header'), 'FMDB compatibility fix missing');
const build = JSON.parse(readFileSync(path.join(root, 'eas.json'), 'utf8')).build.development;
assert.equal(build.ios.simulator, false, 'Vendor SDK is configured for a physical iPhone only');
assert.equal(build.env?.EXPO_NO_CAPABILITY_SYNC, '1', 'Development builds must preserve the shared Apple App ID capabilities');

for (const [name, expectedHash] of Object.entries(manifest.frameworks)) {
  const binary = path.join(moduleRoot, 'ios', 'Vendor', `${name}.framework`, name);
  assert.ok(existsSync(binary), `Missing ${name}. Run scripts/import-hband-sdk.ps1 first.`);
  const actualHash = createHash('sha256').update(readFileSync(binary)).digest('hex');
  assert.equal(actualHash, expectedHash, `${name}: SDK version differs from the pinned distribution`);
}
console.log(`Verified ${Object.keys(manifest.frameworks).length} vendor binaries (SDK ${manifest.sdkVersion}).`);
console.log('EAS target: @axmed-project/axmed. This check does not start a build.');
console.log('Apple configuration matches verified AxMed identifiers (2026-09-11).');
console.log('This local check does not revalidate remote signing credentials or registered devices.');
console.log('G72 compatibility requires a real connection test in the native build.');
