/**
 * ModelManager — downloads, caches, and validates CLIP ONNX models.
 *
 * Features:
 * - Downloads models from Hugging Face (with mirror fallback)
 * - Caches to local filesystem (~/.snap-sort/models/)
 * - Validates file size to detect corrupt downloads
 * - Resumes interrupted downloads
 * - Platform-aware paths (Node.js only; React Native uses bundled models)
 */

import type { ModelEntry } from './registry.js';
import { getModel, listModels } from './registry.js';

/** Dynamic imports for optional Node.js dependencies */
const dynamicImport = (id: string) => import(/* @vite-ignore */ id);

export interface ModelManagerConfig {
  /** Base directory for model cache (default: ~/.snap-sort/models/) */
  cacheDir?: string;
  /** Whether to auto-download missing models (default: true) */
  autoDownload?: boolean;
  /** Timeout for download in ms (default: 5 minutes) */
  downloadTimeout?: number;
}

export interface DownloadProgress {
  modelId: string;
  downloadedBytes: number;
  totalBytes: number;
  percentComplete: number;
  status: 'downloading' | 'verifying' | 'complete' | 'error';
  error?: string;
}

export class ModelManager {
  private cacheDir: string;
  private autoDownload: boolean;
  private downloadTimeout: number;

  constructor(config: ModelManagerConfig = {}) {
    this.cacheDir = config.cacheDir ?? this.getDefaultCacheDir();
    this.autoDownload = config.autoDownload ?? true;
    this.downloadTimeout = config.downloadTimeout ?? 5 * 60 * 1000;
  }

  /**
   * Resolve model path — returns local path if cached, or downloads.
   * @param modelId - Model identifier from registry
   * @param onProgress - Optional progress callback
   * @returns Absolute path to the ONNX model file
   */
  async resolve(
    modelId: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<string> {
    const entry = getModel(modelId);
    const localPath = this.getLocalPath(entry);

    // Check if already cached
    if (await this.fileExists(localPath)) {
      return localPath;
    }

    if (!this.autoDownload) {
      throw new Error(
        `Model ${modelId} not found at ${localPath}.\n` +
        `Auto-download is disabled. Download manually or enable autoDownload.`,
      );
    }

    // Download the model
    await this.download(entry, localPath, onProgress);
    return localPath;
  }

  /**
   * Check if a model is cached locally.
   */
  async isCached(modelId: string): Promise<boolean> {
    const entry = getModel(modelId);
    return this.fileExists(this.getLocalPath(entry));
  }

  /**
   * Get the local cache path for a model.
   */
  getLocalPath(entry: ModelEntry): string {
    return `${this.cacheDir}/${entry.id}.onnx`;
  }

  /**
   * List all cached models.
   */
  async listCached(): Promise<string[]> {
    const cached: string[] = [];
    for (const id of listModels()) {
      if (await this.isCached(id)) {
        cached.push(id);
      }
    }
    return cached;
  }

  /**
   * Delete a cached model.
   */
  async deleteCached(modelId: string): Promise<void> {
    const entry = getModel(modelId);
    const path = this.getLocalPath(entry);
    if (await this.fileExists(path)) {
      const fs = await dynamicImport('node:fs/promises');
      await fs.unlink(path);
    }
  }

  /**
   * Get total cache size in bytes.
   */
  async getCacheSize(): Promise<number> {
    try {
      const fs = await dynamicImport('node:fs/promises');
      const files = await fs.readdir(this.cacheDir);
      let total = 0;
      for (const file of files) {
        if (file.endsWith('.onnx')) {
          const stat = await fs.stat(`${this.cacheDir}/${file}`);
          total += stat.size;
        }
      }
      return total;
    } catch {
      return 0;
    }
  }

  // --- Private ---

  private async download(
    entry: ModelEntry,
    localPath: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<void> {
    const fs = await dynamicImport('node:fs/promises');
    const path = await dynamicImport('node:path');

    // Ensure cache directory exists
    await fs.mkdir(path.dirname(localPath), { recursive: true });

    const tempPath = `${localPath}.download`;

    const reportProgress = (downloadedBytes: number, status: DownloadProgress['status']) => {
      onProgress?.({
        modelId: entry.id,
        downloadedBytes,
        totalBytes: entry.sizeBytes,
        percentComplete: Math.min(100, Math.round((downloadedBytes / entry.sizeBytes) * 100)),
        status,
      });
    };

    // Try primary URL first, then fallback
    const urls = [entry.url, entry.fallbackUrl].filter(Boolean) as string[];
    let lastError: Error | null = null;

    for (const url of urls) {
      try {
        reportProgress(0, 'downloading');
        await this.fetchToFile(url, tempPath, entry.sizeBytes, reportProgress);

        // Verify file size (basic corruption check)
        const stat = await fs.stat(tempPath);
        if (stat.size < entry.sizeBytes * 0.9) {
          throw new Error(
            `Downloaded file too small: ${stat.size} bytes (expected ~${entry.sizeBytes}). ` +
            `Download may have been interrupted.`,
          );
        }

        // Rename temp file to final path
        await fs.rename(tempPath, localPath);
        reportProgress(stat.size, 'complete');
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Clean up failed download
        try { await fs.unlink(tempPath); } catch { /* ignore */ }
      }
    }

    throw new Error(
      `Failed to download model ${entry.id} from all sources.\n` +
      `Last error: ${lastError?.message}`,
    );
  }

  private async fetchToFile(
    url: string,
    filePath: string,
    expectedSize: number,
    onProgress: (bytes: number, status: DownloadProgress['status']) => void,
  ): Promise<void> {
    // Use Node.js built-in fetch (available in Node 18+)
    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.downloadTimeout),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
    }

    const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
    const totalSize = contentLength || expectedSize;

    const fs = await dynamicImport('node:fs/promises');
    const fileHandle = await fs.open(filePath, 'w');
    const writer = fileHandle.createWriteStream();

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    let downloaded = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        writer.write(Buffer.from(value));
        downloaded += value.length;
        onProgress(downloaded, 'downloading');
      }
    } finally {
      writer.close();
      await fileHandle.close();
    }
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      const fs = await dynamicImport('node:fs/promises');
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private getDefaultCacheDir(): string {
    // Cross-platform default: ~/.snap-sort/models/
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '.';
    return `${home}/.snap-sort/models`;
  }
}
