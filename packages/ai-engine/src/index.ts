/**
 * @smart-photo/ai-engine
 * Platform-adaptive AI engine for CLIP embedding extraction.
 */

// Types
export type {
  IEmbeddingAdapter,
  EmbeddingConfig,
  DeviceState,
  ThrottlePolicy,
} from './types.js';

// Base adapter
export { BaseEmbeddingAdapter } from './base-adapter.js';

// Preprocessing
export { normalizeToCHW, computeCenterCrop } from './preprocess.js';
export type { PreprocessedImage } from './preprocess.js';
export { IMAGENET_MEAN, IMAGENET_STD } from './preprocess.js';

// Platform adapters (use dynamic imports to avoid hard dependencies)
export { NodeAdapter } from './adapters/node.js';
export type { NodeAdapterConfig } from './adapters/node.js';
export { ReactNativeAdapter } from './adapters/react-native.js';
export type { ReactNativeAdapterConfig } from './adapters/react-native.js';
export { TauriAdapter } from './adapters/tauri.js';
export { GeminiAdapter } from './adapters/gemini.js';
export type { GeminiAdapterConfig } from './adapters/gemini.js';
