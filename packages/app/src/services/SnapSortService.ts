/**
 * SnapSortService — orchestrates the full photo classification pipeline.
 *
 * Flow: Scan → Embed → Store → Classify → Card Deck → AI Takeover → Delete
 *
 * This is the main integration point connecting:
 * - PhotoScanner (incremental scan + dedup)
 * - IEmbeddingAdapter (CLIP embedding extraction)
 * - IFeatureStore (persistent storage)
 * - KNNClassifier (active learning classification)
 * - UncertaintySampler (smart card ordering)
 * - MediaLibrary (photo deletion)
 */
import {
  PhotoScanner,
  KNNClassifier,
  UncertaintySampler,
  InMemoryFeatureStore,
  SQLiteFeatureStore,
} from '@smart-photo/core';
import type {
  IFeatureStore,
  PhotoRecord,
  IEmbeddingProvider,
  IPhotoSource,
  PhotoAsset,
  ScanProgress,
  Prediction,
  Label,
} from '@smart-photo/core';
import type { IEmbeddingAdapter } from '@smart-photo/ai-engine';

export interface SnapSortConfig {
  /** K for KNN classifier (default: 5) */
  k?: number;
  /** Batch size for scanning (default: 10) */
  scanBatchSize?: number;
  /** Delay between scan batches in ms (default: 50) */
  scanBatchDelay?: number;
  /** Cold start count before active learning kicks in (default: 20) */
  coldStartCount?: number;
  /** AI readiness threshold — ratio of high-confidence predictions (default: 0.8) */
  aiReadyThreshold?: number;
  /** Confidence threshold for high-confidence predictions (default: 0.9) */
  highConfidenceThreshold?: number;
}

export interface PipelineState {
  phase: 'idle' | 'scanning' | 'classifying' | 'ai-takeover' | 'completed';
  scanProgress: ScanProgress | null;
  totalPhotos: number;
  classifiedCount: number;
  aiReady: boolean;
  error: string | null;
}

const DEFAULT_CONFIG: Required<SnapSortConfig> = {
  k: 5,
  scanBatchSize: 10,
  scanBatchDelay: 50,
  coldStartCount: 20,
  aiReadyThreshold: 0.8,
  highConfidenceThreshold: 0.9,
};

export class SnapSortService {
  private config: Required<SnapSortConfig>;
  private store: IFeatureStore;
  private scanner: PhotoScanner | null = null;
  private classifier: KNNClassifier;
  private sampler: UncertaintySampler;
  private embeddingAdapter: IEmbeddingAdapter | IEmbeddingProvider;

  private state: PipelineState = {
    phase: 'idle',
    scanProgress: null,
    totalPhotos: 0,
    classifiedCount: 0,
    aiReady: false,
    error: null,
  };

  private stateListeners: Set<(state: PipelineState) => void> = new Set();

  constructor(
    embeddingAdapter: IEmbeddingAdapter | IEmbeddingProvider,
    store?: IFeatureStore,
    config: SnapSortConfig = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.embeddingAdapter = embeddingAdapter;
    this.store = store ?? new InMemoryFeatureStore();
    this.classifier = new KNNClassifier({ k: this.config.k });
    this.sampler = new UncertaintySampler();
  }

  // --- State Management ---

  getState(): PipelineState {
    return { ...this.state };
  }

  onStateChange(listener: (state: PipelineState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private updateState(partial: Partial<PipelineState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.stateListeners) {
      listener(this.state);
    }
  }

  // --- Phase 1: Scanning ---

  async startScan(photoSource: IPhotoSource): Promise<void> {
    this.updateState({ phase: 'scanning', error: null });

    // Initialize store
    await this.store.init();

    // Create embedding provider wrapper
    const embeddingProvider: IEmbeddingProvider = {
      getEmbedding: (uri: string) => this.embeddingAdapter.getEmbedding(uri),
    };

    this.scanner = new PhotoScanner(photoSource, this.store, embeddingProvider);

    try {
      const progress = await this.scanner.scan({
        batchSize: this.config.scanBatchSize,
        batchDelay: this.config.scanBatchDelay,
        onProgress: (p) => {
          this.updateState({
            scanProgress: p,
            totalPhotos: p.totalPhotos,
          });
        },
      });

      if (progress.status === 'completed') {
        this.updateState({ phase: 'classifying' });
      } else if (progress.status === 'paused') {
        // Stay in scanning phase for resume
      }
    } catch (err) {
      this.updateState({
        error: err instanceof Error ? err.message : 'Scan failed',
      });
    }
  }

  pauseScan(): void {
    this.scanner?.pause();
  }

  async resumeScan(): Promise<void> {
    if (!this.scanner) return;
    this.updateState({ phase: 'scanning' });
    await this.scanner.resume({
      batchSize: this.config.scanBatchSize,
      batchDelay: this.config.scanBatchDelay,
      onProgress: (p) => {
        this.updateState({ scanProgress: p });
      },
    });
  }

  // --- Phase 2: Card Deck Classification ---

  async getCardDeck(): Promise<CardDeckItem[]> {
    const unclassified = await this.store.getUnclassified();

    // Phase 1 (cold start): random shuffle
    // Phase 2 (active learning): uncertainty-sorted
    const labeledCount = this.classifier.sampleCount;
    const items: CardDeckItem[] = unclassified.map(record => {
      let prediction: Prediction | undefined;
      if (labeledCount >= this.config.coldStartCount) {
        try {
          prediction = this.classifier.predict(record.embedding);
        } catch {
          // Not enough samples yet
        }
      }
      return { record, prediction };
    });

    if (labeledCount < this.config.coldStartCount) {
      // Cold start: shuffle randomly
      return items.sort(() => Math.random() - 0.5);
    }

    // Active learning: sort by uncertainty (most uncertain first)
    return items.sort((a, b) => {
      const uncA = a.prediction ? 1 - Math.abs(a.prediction.confidence - 0.5) * 2 : 1;
      const uncB = b.prediction ? 1 - Math.abs(b.prediction.confidence - 0.5) * 2 : 1;
      return uncB - uncA;
    });
  }

  async labelPhoto(photoId: string, label: Label, embedding: number[]): Promise<void> {
    // Add to classifier
    this.classifier.addSample(embedding, label);

    // Update store
    const confidence = this.classifier.sampleCount > 0
      ? this.classifier.predict(embedding).confidence
      : undefined;
    await this.store.updateLabel(photoId, label, confidence);

    this.updateState({
      classifiedCount: this.state.classifiedCount + 1,
    });

    // Check AI readiness
    this.checkAIReadiness();
  }

  undoLabel(): void {
    this.classifier.removeLastSample();
    this.updateState({
      classifiedCount: Math.max(0, this.state.classifiedCount - 1),
      aiReady: false,
    });
  }

  // --- Phase 3: AI Takeover ---

  async getAITakeoverPredictions(): Promise<AIPrediction[]> {
    const unclassified = await this.store.getUnclassified();
    const predictions: AIPrediction[] = [];

    for (const record of unclassified) {
      try {
        const pred = this.classifier.predict(record.embedding);
        predictions.push({
          photoId: record.id,
          label: pred.label,
          confidence: pred.confidence,
          record,
        });
      } catch {
        // Skip if classifier can't predict
      }
    }

    return predictions;
  }

  async confirmAIDeletion(photoIds: string[]): Promise<boolean> {
    // Update labels in store before deletion
    for (const id of photoIds) {
      try {
        await this.store.updateLabel(id, 'trash', 1.0);
      } catch {
        // Record might not exist
      }
    }

    // Actual deletion is done by the platform (MediaLibrary on RN, filesystem on PC)
    // This service only manages the data layer
    return true;
  }

  async markAsDeleted(photoIds: string[]): Promise<void> {
    await this.store.deleteByIds(photoIds);
  }

  // --- Stats ---

  async getStats(): Promise<PipelineStats> {
    const all = await this.store.getAll();
    const unclassified = all.filter(r => !r.label);
    const byLabel: Record<string, number> = {};
    for (const r of all) {
      if (r.label) {
        byLabel[r.label] = (byLabel[r.label] ?? 0) + 1;
      }
    }

    return {
      total: all.length,
      unclassified: unclassified.length,
      byLabel,
      classifierSamples: this.classifier.sampleCount,
      aiReady: this.state.aiReady,
    };
  }

  // --- Internal ---

  private async checkAIReadiness(): Promise<void> {
    if (this.classifier.sampleCount < this.config.coldStartCount) return;

    const unclassified = await this.store.getUnclassified();
    if (unclassified.length === 0) return;

    let highConfidenceCount = 0;
    for (const record of unclassified) {
      try {
        const pred = this.classifier.predict(record.embedding);
        if (pred.confidence > this.config.highConfidenceThreshold) {
          highConfidenceCount++;
        }
      } catch {
        // Skip
      }
    }

    const ratio = highConfidenceCount / unclassified.length;
    if (ratio >= this.config.aiReadyThreshold) {
      this.updateState({ aiReady: true, phase: 'ai-takeover' });
    }
  }

  async dispose(): Promise<void> {
    if ('dispose' in this.embeddingAdapter && typeof this.embeddingAdapter.dispose === 'function') {
      await this.embeddingAdapter.dispose();
    }
    await this.store.close();
  }
}

// --- Types ---

export interface CardDeckItem {
  record: PhotoRecord;
  prediction?: Prediction;
}

export interface AIPrediction {
  photoId: string;
  label: string;
  confidence: number;
  record: PhotoRecord;
}

export interface PipelineStats {
  total: number;
  unclassified: number;
  byLabel: Record<string, number>;
  classifierSamples: number;
  aiReady: boolean;
}
