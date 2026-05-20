/**
 * @smart-photo/core
 * Pure JS core: KNN classifier, active learning, vector math.
 * Zero platform dependencies — works in RN, Tauri, Node, browsers.
 */

// Types
export type {
  Embedding,
  Label,
  Prediction,
  LabeledSample,
  PhotoRecord,
  IClassifier,
  IFeatureStore,
  IActiveLearner,
} from './types.js';

// Vector math
export {
  euclideanDistance,
  cosineSimilarity,
  normalizeInPlace,
  zeros,
  add,
  scale,
  centroid,
} from './vector.js';

// KNN Classifier
export { KNNClassifier } from './classifier.js';
export type { KNNClassifierOptions } from './classifier.js';

// Active Learning
export { UncertaintySampler, selectBatch } from './active-learning.js';

// Feature Store
export { InMemoryFeatureStore } from './feature-store.js';
export { SQLiteFeatureStore } from './sqlite-store.js';
export type { SQLiteDatabaseAdapter } from './sqlite-store.js';

// Scanner
export { PhotoScanner } from './scanner.js';
export type {
  IPhotoSource,
  PhotoAsset,
  IEmbeddingProvider,
  ScanStatus,
  ScanProgress,
  ScanOptions,
} from './scanner.js';

// Adapters
export { createBetterSqlite3Adapter } from './adapters/better-sqlite3.js';
export { createExpoSQLiteAdapter } from './adapters/expo-sqlite.js';
export type { ExpoSQLiteDB } from './adapters/expo-sqlite.js';
