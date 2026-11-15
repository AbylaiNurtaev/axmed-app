import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeviceBindingsCoordinator } from '../src/devices/DeviceBindingsCoordinator.ts';

const band = { id: 'g72-id', name: 'G72', kind: 'fitness-band', adapterId: 'hband', rssi: -40 };
const scale = { id: 'scale-id', name: 'Scale', kind: 'scale', adapterId: 'lefu-scale', rssi: -40 };
const tick = () => new Promise(resolve => setImmediate(resolve));
function adapter(device) {
  let snapshot = { phase: 'idle', devices: [] };const listeners = new Set(), calls = [];
  const emit = state => { snapshot = state; listeners.forEach(fn => fn()); };
  return { id: device.adapterId, kind: device.kind, calls, emit, getSnapshot: () => snapshot,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    startScan: async () => { calls.push('scan'); emit({ phase: 'scanning', devices: [] }); },
    connect: async id => { calls.push(id); emit({ phase: 'verifying', selectedDeviceId: id, devices: [device] }); },
    disconnect: async () => { calls.push('disconnect'); emit({ phase: 'idle', devices: [] }); },
    cancelPending: async () => { calls.push('cancel'); emit({ phase: 'idle', devices: [] }); }
  };
}
function fixture(overrides = {}) {
  const a = adapter(band), b = adapter(scale), saved = [];
  const coordinator = new DeviceBindingsCoordinator([a, b], { load: async () => [], save: async device => { saved.push(device); }, ...overrides });
  return { coordinator, band: a, scale: b, saved };
}

test('only confirmed connections selected by the user are saved; scan and verification are not success', async () => {
  const f = fixture();f.coordinator.setOwner('A');await tick();
  await f.coordinator.scan('fitness-band');await f.coordinator.connect('fitness-band', band.id);assert.equal(f.saved.length, 0);
  f.band.emit({ phase: 'connected', selectedDeviceId: band.id, devices: [band] });await tick();
  assert.equal(f.saved.length, 1);assert.equal(f.coordinator.getSnapshot()['fitness-band'].saved, true);
  f.band.emit({ phase: 'connected', selectedDeviceId: band.id, devices: [band] });assert.equal(f.saved.length, 1);
  f.coordinator.dispose();
});

test('saved bindings restore by exact ID after restart without connecting to another nearby device', async () => {
  const f = fixture({ load: async () => [band, scale] });f.coordinator.setOwner('A');await tick();
  assert.deepEqual(f.band.calls, ['scan']);assert.deepEqual(f.scale.calls, ['scan']);
  f.band.emit({ phase: 'scanning', devices: [{ ...band, id: 'someone-elses-g72' }] });assert.deepEqual(f.band.calls, ['scan']);
  f.band.emit({ phase: 'scanning', devices: [band] });assert.deepEqual(f.band.calls, ['scan', band.id]);
  assert.equal(f.band.getSnapshot().phase, 'verifying');assert.equal(f.saved.length, 0);f.coordinator.dispose();
});

test('an explicit disconnect prevents automatic reconnection for the current session', async () => {
  const f = fixture({ load: async () => [band] });f.coordinator.setOwner('A');await tick();
  await f.coordinator.disconnect('fitness-band');f.coordinator.restoreConnections();assert.deepEqual(f.band.calls, ['scan', 'disconnect']);f.coordinator.dispose();
});

test('failed saves expose a retry without pretending that the DB binding succeeded', async () => {
  let attempts = 0;const f = fixture({ save: async () => { if (++attempts === 1) throw new Error('offline'); } });
  f.coordinator.setOwner('A');await tick();await f.coordinator.connect('scale', scale.id);f.scale.emit({ phase: 'connected', selectedDeviceId: scale.id, devices: [scale] });await tick();
  assert.equal(f.coordinator.getSnapshot().scale.saved, false);assert.ok(f.coordinator.getSnapshot().scale.error);
  await f.coordinator.retrySave('scale');assert.equal(f.coordinator.getSnapshot().scale.saved, true);f.coordinator.dispose();
});

test('logout rejects late save responses and native connection callbacks from the old account', async () => {
  let resolveSave;const f = fixture({ save: () => new Promise(resolve => { resolveSave = resolve; }) });
  f.coordinator.setOwner('A');await tick();await f.coordinator.connect('fitness-band', band.id);f.band.emit({ phase: 'connected', selectedDeviceId: band.id, devices: [band] });
  assert.equal(f.coordinator.getSnapshot()['fitness-band'].saving, true);
  f.coordinator.setOwner('B');resolveSave();await tick();assert.deepEqual(f.coordinator.getSnapshot(), {});
  f.band.emit({ phase: 'connected', selectedDeviceId: band.id, devices: [band] });assert.deepEqual(f.coordinator.getSnapshot(), {});f.coordinator.dispose();
});

test('a stale restore cannot overwrite a newly selected device', async () => {
  let resolveLoad;const f = fixture({ load: () => new Promise(resolve => { resolveLoad = resolve; }) });f.coordinator.setOwner('A');await tick();
  await f.coordinator.connect('fitness-band', band.id);f.band.emit({ phase: 'connected', selectedDeviceId: band.id, devices: [band] });await tick();
  resolveLoad([{ ...band, id: 'old-device' }]);await tick();assert.equal(f.coordinator.getSnapshot()['fitness-band'].device.id, band.id);f.coordinator.dispose();
});

test('a failed restore leaves Bluetooth idle and reports no invented connection', async () => {
  const f = fixture({ load: async () => { throw new Error('offline'); } });f.coordinator.setOwner('A');await tick();assert.deepEqual(f.coordinator.getSnapshot(), {});assert.deepEqual(f.band.calls, []);f.coordinator.dispose();
});

test('returning to the app retries a failed binding load and respects manual disconnection', async () => {
  let online = false;const f = fixture({ load: async () => { if (!online) throw new Error('offline'); return [band]; } });
  f.coordinator.setOwner('A');await tick();online = true;f.coordinator.resume();await tick();assert.deepEqual(f.band.calls, ['scan']);
  await f.coordinator.disconnect('fitness-band');f.coordinator.resume();await tick();assert.deepEqual(f.band.calls, ['scan', 'disconnect']);f.coordinator.dispose();
});
