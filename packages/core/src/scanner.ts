/**
 * PhotoScanner — incremental photo scanning with deduplication and progress tracking.
 *
 * Works with any IFeatureStore and IEmbeddingAdapter.
 * Designed to be interruptible (pause/resume) for battery/thermal management.
 */
import type { IFeatureStore, PhotoRecord, Embedding } from './types.js';

/** Adapter interface for reading photos from the platform's photo library */
export interface IPhotoSource {
  /** Get total count of photos available */
  getTotalCount(): Promise<number>;
  /**
   * Fetch a batch of photo metadata.
   * @param after - cursor for pagination (platform-specific asset ID or timestamp)
   * @param limit - max photos to fetch
   */
  fetchBatch(after: string | null, limit: number): Promise<PhotoAsset[]>;
}

/** Photo asset from the platform's photo library */
export interface PhotoAsset {
  id: string;
  uri: string;
  width: number;
  height: number;
  createdAt: number;
  hash?: string;
}

/** Embedding adapter interface (subset of IEmbeddingAdapter) */
export interface IEmbeddingProvider {
  getEmbedding(uri: string): Promise<Embedding>;
}

export type ScanStatus = 'idle' | 'scanning' | 'paused' | 'completed' | 'error';

export interface ScanProgress {
  status: ScanStatus;
  totalPhotos: number;
  scanned: number;
  newPhotos: number;
  skipped: number;
  errors: number;
  percentComplete: number;
}

export interface ScanOptions {
  /** Batch size for each scan iteration (default: 20) */
  batchSize?: number;
  /** Delay between batches in ms to avoid hammering the system (default: 100) */
  batchDelay?: number;
  /** Called after each batch is processed */
  onProgress?: (progress: ScanProgress) => void;
}

export class PhotoScanner {
  private source: IPhotoSource;
  private store: IFeatureStore;
  private embeddingProvider: IEmbeddingProvider;

  private status: ScanStatus = 'idle';
  private shouldStop = false;

  constructor(
    source: IPhotoSource,
    store: IFeatureStore,
    embeddingProvider: IEmbeddingProvider,
  ) {
    this.source = source;
    this.store = store;
    this.embeddingProvider = embeddingProvider;
  }

  /**
   * Run an incremental scan.
   * Resumes from the last scanned photo based on stored IDs.
   */
  async scan(options: ScanOptions = {}): Promise<ScanProgress> {
    const {
      batchSize = 20,
      batchDelay = 100,
      onProgress,
    } = options;

    this.status = 'scanning';
    this.shouldStop = false;

    const totalPhotos = await this.source.getTotalCount();
    const progress: ScanProgress = {
      status: 'scanning',
      totalPhotos,
      scanned: 0,
      newPhotos: 0,
      skipped: 0,
      errors: 0,
      percentComplete: 0,
    };

    // Build set of already-scanned IDs
    const existingRecords = await this.store.getAll();
    const existingIds = new Set(existingRecords.map(r => r.id));

    let cursor: string | null = null;
    let hasMore = true;

    while (hasMore && !this.shouldStop) {
      try {
        const batch = await this.source.fetchBatch(cursor, batchSize);
        if (batch.length === 0) {
          hasMore = false;
          break;
        }

        const newRecords: PhotoRecord[] = [];

        for (const asset of batch) {
          if (this.shouldStop) break;

          // Skip if already in store
          if (existingIds.has(asset.id)) {
            progress.skipped++;
            continue;
          }

          try {
            // Compute embedding
            const embedding = await this.embeddingProvider.getEmbedding(asset.uri);

            const record: PhotoRecord = {
              id: asset.id,
              hash: asset.hash,
              embedding,
              createdAt: asset.createdAt,
            };

            newRecords.push(record);
            progress.newPhotos++;
          } catch (err) {
            progress.errors++;
            console.warn(`[PhotoScanner] Failed to process ${asset.id}:`, err);
          }
        }

        // Batch save new records
        if (newRecords.length > 0) {
          await this.store.saveBatch(newRecords);
        }

        progress.scanned += batch.length;
        progress.percentComplete = totalPhotos > 0
          ? Math.min(100, Math.round((progress.scanned / totalPhotos) * 100))
          : 100;

        cursor = batch[batch.length - 1].id;
        onProgress?.(progress);

        // Throttle between batches
        if (batchDelay > 0 && !this.shouldStop) {
          await sleep(batchDelay);
        }
      } catch (err) {
        progress.errors++;
        console.error('[PhotoScanner] Batch error:', err);
        // Continue to next batch on error
      }
    }

    progress.status = this.shouldStop ? 'paused' : 'completed';
    this.status = progress.status;
    onProgress?.(progress);

    return progress;
  }

  /** Pause the current scan */
  pause(): void {
    this.shouldStop = true;
  }

  /** Resume a paused scan */
  async resume(options?: ScanOptions): Promise<ScanProgress> {
    if (this.status !== 'paused') {
      throw new Error('Cannot resume: scan is not paused');
    }
    return this.scan(options);
  }

  getStatus(): ScanStatus {
    return this.status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
