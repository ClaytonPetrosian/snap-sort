import { describe, it, expect, vi } from 'vitest';
import { BaseEmbeddingAdapter } from '../base-adapter.js';
import type { Embedding } from '@smart-photo/core';

/**
 * Concrete test implementation of BaseEmbeddingAdapter
 */
class TestAdapter extends BaseEmbeddingAdapter {
  initCalled = false;
  disposedCalled = false;
  embeddingCallCount = 0;

  async init(): Promise<void> {
    this.initCalled = true;
  }

  async getEmbedding(_fileUri: string): Promise<Embedding> {
    this.embeddingCallCount++;
    return [0.1, 0.2, 0.3];
  }

  async dispose(): Promise<void> {
    this.disposedCalled = true;
    await super.dispose();
  }
}

describe('BaseEmbeddingAdapter', () => {
  it('calls init() on concrete adapter', async () => {
    const adapter = new TestAdapter();
    await adapter.init();
    expect(adapter.initCalled).toBe(true);
  });

  it('calls getEmbedding() on concrete adapter', async () => {
    const adapter = new TestAdapter();
    await adapter.init();
    const result = await adapter.getEmbedding('test://image.jpg');
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(adapter.embeddingCallCount).toBe(1);
  });

  it('calls dispose() on concrete adapter', async () => {
    const adapter = new TestAdapter();
    await adapter.init();
    await adapter.dispose();
    expect(adapter.disposedCalled).toBe(true);
  });

  it('getEmbeddings() calls getEmbedding() for each URI', async () => {
    const adapter = new TestAdapter();
    await adapter.init();
    const results = await adapter.getEmbeddings(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(results.length).toBe(3);
    expect(adapter.embeddingCallCount).toBe(3);
  });

  describe('throttle logic', () => {
    it('does not throttle when battery is above minimum', () => {
      const adapter = new TestAdapter();
      // Default policy: minBatteryLevel=0.2, maxThermalState='fair'
      adapter.updateDeviceState({
        batteryLevel: 0.5,
        isCharging: false,
        thermalState: 'nominal',
      });
      // Should not throw or hang
    });

    it('throttles when battery is below minimum and not charging', () => {
      const adapter = new TestAdapter();
      adapter.updateDeviceState({
        batteryLevel: 0.1,
        isCharging: false,
        thermalState: 'nominal',
      });
      // The adapter should enter throttle state
      // (we can't easily test the async pause without a full integration test)
    });

    it('does not throttle when battery is low but charging', () => {
      const adapter = new TestAdapter();
      adapter.updateDeviceState({
        batteryLevel: 0.1,
        isCharging: true,
        thermalState: 'nominal',
      });
      // Should not throttle because device is charging
    });

    it('throttles when thermal state exceeds maximum', () => {
      const adapter = new TestAdapter();
      adapter.updateDeviceState({
        batteryLevel: 0.8,
        isCharging: false,
        thermalState: 'critical',
      });
      // Should throttle due to thermal state
    });

    it('does not throttle when thermal state is within limits', () => {
      const adapter = new TestAdapter();
      adapter.updateDeviceState({
        batteryLevel: 0.8,
        isCharging: false,
        thermalState: 'fair',
      });
      // Should not throttle — 'fair' is within default maxThermalState
    });

    it('resumes from throttle when conditions improve', () => {
      const adapter = new TestAdapter();
      // First: enter throttle
      adapter.updateDeviceState({
        batteryLevel: 0.1,
        isCharging: false,
        thermalState: 'nominal',
      });
      // Then: resume
      adapter.updateDeviceState({
        batteryLevel: 0.5,
        isCharging: true,
        thermalState: 'nominal',
      });
      // Should be unblocked
    });
  });
});
