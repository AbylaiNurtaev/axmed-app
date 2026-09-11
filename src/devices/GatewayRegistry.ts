import type { DeviceAdapter, DeviceKind } from "./types";

export class DeviceGateway {
  private readonly adapters = new Map<string, DeviceAdapter>();
  register(adapter: DeviceAdapter) {
    if (this.adapters.has(adapter.id)) throw new Error(`Adapter already registered: ${adapter.id}`);
    this.adapters.set(adapter.id, adapter);
  }
  forKind(kind: DeviceKind): DeviceAdapter {
    const matches = [...this.adapters.values()].filter(adapter => adapter.kind === kind);
    if (matches.length !== 1) throw new Error(`Expected one adapter for ${kind}; found ${matches.length}`);
    return matches[0];
  }
}
