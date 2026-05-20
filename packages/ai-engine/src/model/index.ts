/**
 * Model management — download, cache, and resolve CLIP ONNX models.
 */

export { ModelManager } from './manager.js';
export type { ModelManagerConfig, DownloadProgress } from './manager.js';
export { MODEL_REGISTRY, getModel, listModels } from './registry.js';
export type { ModelEntry } from './registry.js';
