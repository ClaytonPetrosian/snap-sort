/**
 * Core type definitions for SmartPhoto.
 * All types are platform-agnostic — no React Native, Tauri, or Node.js dependencies.
 */

/** 512-dimensional CLIP embedding vector */
export type Embedding = number[];

/** Classification label (e.g., "trash", "keep", "work") */
export type Label = string;

/** KNN prediction result */
export interface Prediction {
  label: Label;
  confidence: number; // 0..1
}

/** A single labeled sample used for training */
export interface LabeledSample {
  embedding: Embedding;
  label: Label;
}

/** Photo metadata record stored in the feature database */
export interface PhotoRecord {
  /** Platform-specific ID (mobile: AssetID, PC: absolute file path) */
  id: string;
  /** Optional SHA-256 hash for deduplication */
  hash?: string;
  /** CLIP embedding vector */
  embedding: Embedding;
  /** Photo creation timestamp (Unix ms) */
  createdAt: number;
  /** Classification label after user or AI tagging */
  label?: Label;
  /** AI prediction confidence (0..1), set after auto-classification */
  aiConfidence?: number;
}

/**
 * Classifier interface — the core contract.
 * Mobile and PC UI layers both depend on this.
 */
export interface IClassifier {
  /** Add a labeled sample to the training set */
  addSample(embedding: Embedding, label: Label): void;
  /** Remove the last added sample (undo support) */
  removeLastSample(): LabeledSample | null;
  /** Predict label and confidence for a target embedding */
  predict(targetEmbedding: Embedding): Prediction;
  /** Get current training set size */
  get sampleCount(): number;
  /** Get count of samples per label */
  getLabelCounts(): Record<Label, number>;
  /** Export training data for persistence */
  exportSamples(): LabeledSample[];
  /** Import training data from persistence */
  importSamples(samples: LabeledSample[]): void;
}

/**
 * Abstract feature store interface.
 * Implementations: SQLite, WatermelonDB, LevelDB, in-memory, etc.
 */
export interface IFeatureStore {
  /** Initialize the store (create tables/indexes if needed) */
  init(): Promise<void>;
  /** Save a photo record */
  save(record: PhotoRecord): Promise<void>;
  /** Batch save photo records */
  saveBatch(records: PhotoRecord[]): Promise<void>;
  /** Get a photo record by ID */
  getById(id: string): Promise<PhotoRecord | null>;
  /** Get all records without a label (unclassified) */
  getUnclassified(): Promise<PhotoRecord[]>;
  /** Get all records */
  getAll(): Promise<PhotoRecord[]>;
  /** Update label and AI confidence for a record */
  updateLabel(id: string, label: Label, aiConfidence?: number): Promise<void>;
  /** Batch update labels */
  updateLabelsBatch(updates: Array<{ id: string; label: Label; aiConfidence?: number }>): Promise<void>;
  /** Delete records by IDs */
  deleteByIds(ids: string[]): Promise<void>;
  /** Get total count */
  count(): Promise<number>;
  /** Close the store */
  close(): Promise<void>;
}

/**
 * Active learning strategy interface.
 * Determines which unclassified sample to show next.
 */
export interface IActiveLearner {
  /**
   * Select the next sample for the user to label.
   * Uses uncertainty sampling: picks the sample closest to 50% confidence.
   * @param unclassified - unclassified photo embeddings
   * @param classifier - current classifier instance
   * @returns index into unclassified array, or -1 if no samples
   */
  selectNext(
    unclassified: Embedding[],
    classifier: IClassifier,
  ): { index: number; expectedConfidence: number } | null;
}
