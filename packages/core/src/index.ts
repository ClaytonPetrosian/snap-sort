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
