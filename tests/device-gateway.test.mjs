import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConnectionAdapter } from '../src/devices/ConnectionAdapter.ts';
import { DeviceGateway } from '../src/devices/GatewayRegistry.ts';

const device = { id: 'ios-test-id', name: 'Test device', kind: 'fitness-band', adapterId: 'hband', rssi: -48 };
function fixture() {
  let listener;
  let resolveSnapshot;
  let removed = false;
  const calls = [];
  const transport = {
    getSnapshot: () => new Promise(resolve => { resolveSnapshot = resolve; }),
    addListener: (_, fn) => { listener = fn; return { remove: () => { removed = true; } }; },
    startScan: async () => { calls.push('scan'); listener({ phase: 'scanning', devices: [] }); },
    connect: async id => { calls.push(id); listener({ phase: 'verifying', devices: [device], selectedDeviceId: id }); },
    cancelPending: async () => { calls.push('cancel'); listener({ phase: 'idle', devices: [] }); },
    disconnect: async () => { calls.push('disconnect'); listener({ phase: 'idle', devices: [] }); }
  };
  const adapter = new ConnectionAdapter('hband', 'fitness-band', transport);
  return { adapter, transport, calls, emit: data => listener(data), resolve: data => resolveSnapshot(data), removed: () => removed };
}

test('Expo Go fallback never reports success', async () => {
  const adapter = new ConnectionAdapter('hband', 'fitness-band', null);
  await adapter.startScan();
  assert.equal(adapter.getSnapshot().errorCode, 'nativeBuildRequired');
  await adapter.cancelPending();
  assert.equal(adapter.getSnapshot().phase, 'idle');
});
test('physical connection / verification is not ready', async () => {
  const f = fixture();
  await f.adapter.startScan();
  await f.adapter.connect(device.id);
  assert.equal(f.adapter.getSnapshot().phase, 'verifying');
  f.emit({ phase: 'connected', devices: [device], selectedDeviceId: device.id });
  assert.equal(f.adapter.getSnapshot().phase, 'connected');
  await f.adapter.disconnect();
  assert.equal(f.adapter.getSnapshot().phase, 'idle');
  f.adapter.dispose();
});
test('late initial snapshot cannot overwrite a live event', async () => {
  const f = fixture();
  f.emit({ phase: 'scanning', devices: [device] });
  f.resolve({ phase: 'idle', devices: [] });
  await Promise.resolve();
  assert.equal(f.adapter.getSnapshot().phase, 'scanning');
  f.adapter.dispose();
});
test('cannot report connected without the selected device', () => {
  const f = fixture();
  f.emit({ phase: 'connected', devices: [] });
  assert.equal(f.adapter.getSnapshot().errorCode, 'invalidNativeState');
  f.adapter.dispose();
});
test('UI and native subscriptions can be cleaned up', () => {
  const f = fixture();
  let calls = 0;
  const unsubscribe = f.adapter.subscribe(() => calls++);
  f.emit({ phase: 'scanning', devices: [] });
  unsubscribe();
  f.emit({ phase: 'idle', devices: [] });
  assert.equal(calls, 1);
  f.adapter.dispose();
  assert.equal(f.removed(), true);
});
test('transport failure becomes a recoverable error', async () => {
  const f = fixture();
  f.transport.startScan = async () => { throw new Error('native unavailable'); };
  await f.adapter.startScan();
  assert.equal(f.adapter.getSnapshot().errorCode, 'nativeUnavailable');
  f.adapter.dispose();
});
test('registry supports another device kind without changing the bracelet adapter', () => {
  const registry = new DeviceGateway();
  const band = new ConnectionAdapter('hband', 'fitness-band', null);
  const scale = new ConnectionAdapter('future-scale', 'scale', null);
  registry.register(band);
  registry.register(scale);
  assert.equal(registry.forKind('fitness-band'), band);
  assert.equal(registry.forKind('scale'), scale);
  assert.throws(() => registry.register(band), /already registered/);
});
