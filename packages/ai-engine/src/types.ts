/**
 * AI Engine types and adapter interfaces.
 */
import type { Embedding } from '@smart-photo/core';

/**
 * Unified adapter interface for CLIP embedding extraction.
 * Each platform implements this differently:
 * - React Native: onnxruntime-react-native
 * - Tauri: ort (Rust) via Tauri invoke, or onnxruntime-node
 * - Node.js: onnxruntime-node
 */
export interface IEmbeddingAdapter {
  /**
   * Initialize the model (load weights, warm up inference).
   * Call once at app startup.
   */
  init(): Promise<void>;

  /**
   * Extract CLIP embedding from an image file.
   * @param fileUri - platform-specific URI (mobile: asset://..., PC: file:///...)
   * @returns 512-dimensional embedding vector
   */
  getEmbedding(fileUri: string): Promise<Embedding>;

  /**
   * Batch extract embeddings from multiple images.
   * Default implementation calls getEmbedding sequentially.
   * Adapters can override with batched inference for better throughput.
   */
  getEmbeddings(fileUris: string[]): Promise<Embedding[]>;

  /**
   * Release model resources.
   */
  dispose(): Promise<void>;
}

/** Configuration for embedding extraction */
export interface EmbeddingConfig {
  /** Model name or path (default: 'clip-vit-base-patch32') */
  model?: string;
  /** Embedding dimension (default: 512) */
  dimension?: number;
  /** Image resize target (default: 224 for CLIP ViT-B/32) */
  imageSize?: number;
}

/** Battery/thermal state for throttling */
export interface DeviceState {
  batteryLevel: number;   // 0..1
  isCharging: boolean;
  thermalState: 'nominal' | 'fair' | 'serious' | 'critical';
}

/** Throttle policy */
export interface ThrottlePolicy {
  /** Pause extraction when battery below this level (default: 0.2) */
  minBatteryLevel?: number;
  /** Pause extraction when thermal state is serious or worse */
  maxThermalState?: 'nominal' | 'fair';
}
