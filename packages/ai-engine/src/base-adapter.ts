/**
 * Base adapter with common throttling and batch logic.
 * Platform-specific adapters extend this.
 */
import type { Embedding } from '@smart-photo/core';
import type { IEmbeddingAdapter, DeviceState, ThrottlePolicy } from './types.js';

export abstract class BaseEmbeddingAdapter implements IEmbeddingAdapter {
  private disposed = false;
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;

  protected throttlePolicy: ThrottlePolicy = {
    minBatteryLevel: 0.2,
    maxThermalState: 'fair',
  };

  abstract init(): Promise<void>;
  abstract getEmbedding(fileUri: string): Promise<Embedding>;

  async dispose(): Promise<void> {
    this.disposed = true;
  }

  /**
   * Default batch implementation — sequential.
   * Override in platform adapters for true batched inference.
   */
  async getEmbeddings(fileUris: string[]): Promise<Embedding[]> {
    const results: Embedding[] = [];
    for (const uri of fileUris) {
      await this.checkThrottle();
      if (this.disposed) break;
      results.push(await this.getEmbedding(uri));
    }
    return results;
  }

  /**
   * Update device state for throttling decisions.
   * Call this from the native side when battery/thermal state changes.
   */
  updateDeviceState(state: DeviceState): void {
    const shouldPause = this.shouldThrottle(state);
    if (shouldPause && !this.pausePromise) {
      this.pausePromise = new Promise(resolve => {
        this.pauseResolve = resolve;
      });
    } else if (!shouldPause && this.pausePromise) {
      this.pauseResolve?.();
      this.pausePromise = null;
      this.pauseResolve = null;
    }
  }

  private shouldThrottle(state: DeviceState): boolean {
    const { minBatteryLevel, maxThermalState } = this.throttlePolicy;
    if (!state.isCharging && state.batteryLevel < (minBatteryLevel ?? 0.2)) {
      return true;
    }
    const thermalOrder = ['nominal', 'fair', 'serious', 'critical'];
    const maxIndex = thermalOrder.indexOf(maxThermalState ?? 'fair');
    const currentIndex = thermalOrder.indexOf(state.thermalState);
    if (currentIndex > maxIndex) {
      return true;
    }
    return false;
  }

  private async checkThrottle(): Promise<void> {
    if (this.pausePromise) {
      await this.pausePromise;
    }
  }
}
