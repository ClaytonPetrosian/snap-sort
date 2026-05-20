/**
 * Tests for model registry and manager.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MODEL_REGISTRY, getModel, listModels } from '../model/registry.js';
import { ModelManager } from '../model/manager.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Model Registry', () => {
  it('lists all available models', () => {
    const models = listModels();
    expect(models).toContain('clip-vit-base-patch32');
    expect(models).toContain('mobileclip-s0');
    expect(models.length).toBeGreaterThanOrEqual(2);
  });

  it('gets model by ID', () => {
    const model = getModel('clip-vit-base-patch32');
    expect(model.id).toBe('clip-vit-base-patch32');
    expect(model.name).toBe('CLIP ViT-B/32');
    expect(model.dimension).toBe(512);
    expect(model.imageSize).toBe(224);
    expect(model.inputName).toBe('pixel_values');
    expect(model.outputName).toBe('image_embeds');
    expect(model.url).toContain('huggingface');
  });

  it('throws for unknown model', () => {
    expect(() => getModel('nonexistent-model')).toThrow('Unknown model');
  });

  it('all models have valid URLs', () => {
    for (const id of listModels()) {
      const model = getModel(id);
      expect(model.url).toMatch(/^https?:\/\//);
      expect(model.sizeBytes).toBeGreaterThan(0);
      expect(model.dimension).toBeGreaterThan(0);
      expect(model.imageSize).toBeGreaterThan(0);
    }
  });

  it('mobileclip is smaller than vit-base', () => {
    const vit = getModel('clip-vit-base-patch32');
    const mobile = getModel('mobileclip-s0');
    expect(mobile.sizeBytes).toBeLessThan(vit.sizeBytes);
  });
});

describe('ModelManager', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'snap-sort-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates manager with custom cache dir', () => {
    const manager = new ModelManager({ cacheDir: tempDir });
    expect(manager).toBeDefined();
  });

  it('reports model as not cached initially', async () => {
    const manager = new ModelManager({ cacheDir: tempDir });
    const cached = await manager.isCached('clip-vit-base-patch32');
    expect(cached).toBe(false);
  });

  it('detects cached model', async () => {
    const manager = new ModelManager({ cacheDir: tempDir });
    // Create a fake cached file
    const fakeModel = join(tempDir, 'clip-vit-base-patch32.onnx');
    await writeFile(fakeModel, Buffer.alloc(1024));

    const cached = await manager.isCached('clip-vit-base-patch32');
    expect(cached).toBe(true);
  });

  it('resolves cached model without downloading', async () => {
    const manager = new ModelManager({ cacheDir: tempDir, autoDownload: false });
    // Create a fake cached file
    const fakeModel = join(tempDir, 'clip-vit-base-patch32.onnx');
    await writeFile(fakeModel, Buffer.alloc(1024));

    const path = await manager.resolve('clip-vit-base-patch32');
    // Normalize path separators for cross-platform comparison
    expect(path.replace(/\\/g, '/')).toBe(fakeModel.replace(/\\/g, '/'));
  });

  it('throws when auto-download disabled and model not cached', async () => {
    const manager = new ModelManager({ cacheDir: tempDir, autoDownload: false });
    await expect(manager.resolve('clip-vit-base-patch32')).rejects.toThrow(
      'Auto-download is disabled',
    );
  });

  it('returns correct local path', () => {
    const manager = new ModelManager({ cacheDir: '/custom/models' });
    const model = getModel('clip-vit-base-patch32');
    const path = manager.getLocalPath(model);
    expect(path).toBe('/custom/models/clip-vit-base-patch32.onnx');
  });

  it('lists cached models', async () => {
    const manager = new ModelManager({ cacheDir: tempDir });
    // Create fake cached files
    await writeFile(join(tempDir, 'clip-vit-base-patch32.onnx'), Buffer.alloc(1024));

    const cached = await manager.listCached();
    expect(cached).toContain('clip-vit-base-patch32');
    expect(cached).not.toContain('mobileclip-s0');
  });

  it('computes cache size', async () => {
    const manager = new ModelManager({ cacheDir: tempDir });
    await writeFile(join(tempDir, 'clip-vit-base-patch32.onnx'), Buffer.alloc(2048));
    await writeFile(join(tempDir, 'mobileclip-s0.onnx'), Buffer.alloc(1024));

    const size = await manager.getCacheSize();
    expect(size).toBe(3072);
  });

  it('deletes cached model', async () => {
    const manager = new ModelManager({ cacheDir: tempDir });
    const fakeModel = join(tempDir, 'clip-vit-base-patch32.onnx');
    await writeFile(fakeModel, Buffer.alloc(1024));

    await manager.deleteCached('clip-vit-base-patch32');
    const cached = await manager.isCached('clip-vit-base-patch32');
    expect(cached).toBe(false);
  });
});
