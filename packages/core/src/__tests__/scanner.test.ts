import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhotoScanner } from '../scanner.js';
import { InMemoryFeatureStore } from '../feature-store.js';
import type { IPhotoSource, PhotoAsset, IEmbeddingProvider } from '../scanner.js';

// Mock photo source
function createMockSource(photos: PhotoAsset[]): IPhotoSource {
  return {
    getTotalCount: vi.fn().mockResolvedValue(photos.length),
    fetchBatch: vi.fn().mockImplementation(async (after: string | null, limit: number) => {
      let startIdx = 0;
      if (after) {
        const idx = photos.findIndex(p => p.id === after);
        startIdx = idx >= 0 ? idx + 1 : 0;
      }
      return photos.slice(startIdx, startIdx + limit);
    }),
  };
}

// Mock embedding provider — returns random 512-dim vectors
function createMockEmbedder(): IEmbeddingProvider & { callCount: number } {
  const provider = {
    callCount: 0,
    async getEmbedding(_uri: string): Promise<number[]> {
      provider.callCount++;
      return new Array(512).fill(0).map(() => Math.random());
    },
  };
  return provider;
}

const mockPhotos: PhotoAsset[] = [
  { id: '1', uri: 'file://1.jpg', width: 100, height: 100, createdAt: 1000 },
  { id: '2', uri: 'file://2.jpg', width: 200, height: 200, createdAt: 2000 },
  { id: '3', uri: 'file://3.jpg', width: 300, height: 300, createdAt: 3000 },
  { id: '4', uri: 'file://4.jpg', width: 400, height: 400, createdAt: 4000 },
  { id: '5', uri: 'file://5.jpg', width: 500, height: 500, createdAt: 5000 },
];

describe('PhotoScanner', () => {
  let store: InMemoryFeatureStore;

  beforeEach(async () => {
    store = new InMemoryFeatureStore();
    await store.init();
  });

  it('scans all photos and stores embeddings', async () => {
    const source = createMockSource(mockPhotos);
    const embedder = createMockEmbedder();
    const scanner = new PhotoScanner(source, store, embedder);

    const progress = await scanner.scan({ batchSize: 2, batchDelay: 0 });

    expect(progress.status).toBe('completed');
    expect(progress.scanned).toBe(5);
    expect(progress.newPhotos).toBe(5);
    expect(progress.skipped).toBe(0);
    expect(progress.errors).toBe(0);
    expect(progress.percentComplete).toBe(100);
    expect(embedder.callCount).toBe(5);

    // Verify records are stored
    expect(await store.count()).toBe(5);
    const record = await store.getById('3');
    expect(record).not.toBeNull();
    expect(record!.embedding).toHaveLength(512);
  });

  it('skips already-scanned photos on re-scan', async () => {
    // Pre-populate store with some records
    await store.save({
      id: '1',
      embedding: new Array(512).fill(0),
      createdAt: 1000,
    });
    await store.save({
      id: '2',
      embedding: new Array(512).fill(0),
      createdAt: 2000,
    });

    const source = createMockSource(mockPhotos);
    const embedder = createMockEmbedder();
    const scanner = new PhotoScanner(source, store, embedder);

    const progress = await scanner.scan({ batchSize: 10, batchDelay: 0 });

    expect(progress.scanned).toBe(5);
    expect(progress.newPhotos).toBe(3); // Only 3 new
    expect(progress.skipped).toBe(2);
    expect(embedder.callCount).toBe(3);
    expect(await store.count()).toBe(5);
  });

  it('reports progress via onProgress callback', async () => {
    const source = createMockSource(mockPhotos);
    const embedder = createMockEmbedder();
    const scanner = new PhotoScanner(source, store, embedder);

    const progressCalls: number[] = [];
    await scanner.scan({
      batchSize: 2,
      batchDelay: 0,
      onProgress: (p) => progressCalls.push(p.scanned),
    });

    // With 5 photos and batch size 2: batches are [2, 4, 5]
    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
    expect(progressCalls[progressCalls.length - 1]).toBe(5);
  });

  it('can be paused and resumed', async () => {
    const source = createMockSource(mockPhotos);
    const embedder = createMockEmbedder();
    const scanner = new PhotoScanner(source, store, embedder);

    // Start scanning, pause after first batch
    let pausedAt = 0;
    const scanPromise = scanner.scan({
      batchSize: 2,
      batchDelay: 0,
      onProgress: (p) => {
        if (p.scanned >= 2 && pausedAt === 0) {
          pausedAt = p.scanned;
          scanner.pause();
        }
      },
    });

    const result = await scanPromise;
    expect(result.status).toBe('paused');
    expect(result.scanned).toBeGreaterThanOrEqual(2);

    // Resume
    const resumed = await scanner.resume({ batchSize: 10, batchDelay: 0 });
    expect(resumed.status).toBe('completed');
    expect(resumed.scanned).toBe(5);
  });

  it('handles embedding errors gracefully', async () => {
    const source = createMockSource(mockPhotos);
    const embedder: IEmbeddingProvider = {
      async getEmbedding(uri: string): Promise<number[]> {
        if (uri === 'file://3.jpg') {
          throw new Error('Embedding failed');
        }
        return new Array(512).fill(0);
      },
    };
    const scanner = new PhotoScanner(source, store, embedder);

    const progress = await scanner.scan({ batchSize: 10, batchDelay: 0 });

    expect(progress.status).toBe('completed');
    expect(progress.errors).toBe(1);
    expect(progress.newPhotos).toBe(4);
    expect(await store.count()).toBe(4);
  });

  it('handles empty photo library', async () => {
    const source = createMockSource([]);
    const embedder = createMockEmbedder();
    const scanner = new PhotoScanner(source, store, embedder);

    const progress = await scanner.scan({ batchSize: 10, batchDelay: 0 });

    expect(progress.status).toBe('completed');
    expect(progress.scanned).toBe(0);
    expect(progress.totalPhotos).toBe(0);
    expect(embedder.callCount).toBe(0);
  });
});
