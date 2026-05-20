/**
 * Node.js CLIP adapter — uses onnxruntime-node + sharp for real CLIP inference.
 *
 * This is the primary adapter for PC/Tauri backend and development/testing.
 *
 * Dependencies (install in consuming project):
 *   npm install onnxruntime-node sharp
 *
 * Model setup:
 *   Option 1: Place the ONNX model at: ./models/clip-vit-base-patch32.onnx
 *   Option 2: Use ModelManager to auto-download from Hugging Face
 *   Option 3: Specify a custom path via NodeAdapterConfig.modelPath
 *
 * The expected ONNX model has:
 *   Input:  "pixel_values" — Float32[1, 3, 224, 224]
 *   Output: "image_embeds" — Float32[1, 512]
 */
import type { Embedding } from '@smart-photo/core';
import { BaseEmbeddingAdapter } from '../base-adapter.js';
import type { EmbeddingConfig } from '../types.js';
import { normalizeToCHW } from '../preprocess.js';
import { ModelManager } from '../model/manager.js';
import { getModel } from '../model/registry.js';
import type { DownloadProgress } from '../model/manager.js';

const DEFAULT_CONFIG: Required<EmbeddingConfig> = {
  model: 'clip-vit-base-patch32',
  dimension: 512,
  imageSize: 224,
};

/**
 * Dynamic imports for optional dependencies.
 * These are loaded lazily so the module can be imported without installing them.
 */
let _ort: any = null;
let _sharp: any = null;

// Use dynamic import to avoid TypeScript module resolution errors
// when optional dependencies are not installed.
const dynamicImport = (id: string) => import(/* @vite-ignore */ id);

async function loadOrt(): Promise<any> {
  if (!_ort) {
    try {
      _ort = await dynamicImport('onnxruntime-node');
    } catch {
      throw new Error(
        'onnxruntime-node is required for the Node.js adapter.\n' +
        'Install it: npm install onnxruntime-node',
      );
    }
  }
  return _ort;
}

async function loadSharp(): Promise<any> {
  if (!_sharp) {
    try {
      const mod = await dynamicImport('sharp');
      _sharp = mod.default ?? mod;
    } catch {
      throw new Error(
        'sharp is required for image preprocessing.\n' +
        'Install it: npm install sharp',
      );
    }
  }
  return _sharp;
}

export interface NodeAdapterConfig extends EmbeddingConfig {
  /** Path to ONNX model file. If not set, uses ModelManager to resolve. */
  modelPath?: string;
  /** Execution providers in priority order (default: ['cpu']) */
  executionProviders?: string[];
  /** Auto-download model if not cached (default: true) */
  autoDownload?: boolean;
  /** Custom model cache directory */
  modelCacheDir?: string;
  /** Called during model download with progress info */
  onDownloadProgress?: (progress: DownloadProgress) => void;
}

export class NodeAdapter extends BaseEmbeddingAdapter {
  private config: Required<EmbeddingConfig> & {
    modelPath?: string;
    executionProviders: string[];
    autoDownload: boolean;
    modelCacheDir?: string;
  };
  private onDownloadProgress?: (progress: DownloadProgress) => void;
  private session: any = null;
  private modelManager: ModelManager;

  constructor(config: NodeAdapterConfig = {}) {
    super();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      executionProviders: config.executionProviders ?? ['cpu'],
      autoDownload: config.autoDownload ?? true,
    };
    this.onDownloadProgress = config.onDownloadProgress;
    this.modelManager = new ModelManager({
      cacheDir: config.modelCacheDir,
      autoDownload: config.autoDownload ?? true,
    });
  }

  async init(): Promise<void> {
    const ort = await loadOrt();

    // Resolve model path: explicit path > ModelManager cache
    let modelPath: string;
    if (this.config.modelPath) {
      modelPath = this.config.modelPath;
    } else {
      // Use ModelManager to resolve (download if needed)
      modelPath = await this.modelManager.resolve(
        this.config.model,
        this.onDownloadProgress,
      );
    }

    try {
      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: this.config.executionProviders,
      });
    } catch (err) {
      throw new Error(
        `Failed to load CLIP model from ${modelPath}: ${err instanceof Error ? err.message : err}\n` +
        'Make sure the ONNX model file exists and is valid.',
      );
    }

    const modelEntry = getModel(this.config.model);
    console.log(
      `[Node Adapter] CLIP model loaded: ${modelEntry.name} from ${modelPath}`,
    );
  }

  async getEmbedding(fileUri: string): Promise<Embedding> {
    if (!this.session) {
      throw new Error('Adapter not initialized. Call init() first.');
    }

    const ort = await loadOrt();
    const sharp = await loadSharp();

    // 1. Read and preprocess image — resize to 224x224 center-crop
    const filePath = fileUri.replace(/^file:\/\//, '');

    const imageBuffer = await sharp(filePath)
      .resize(this.config.imageSize, this.config.imageSize, {
        fit: 'cover',
        position: 'centre',
      })
      .removeAlpha()
      .raw()
      .toBuffer();

    // 2. Normalize to CHW
    const preprocessed = normalizeToCHW(
      new Uint8Array(imageBuffer),
      this.config.imageSize,
      this.config.imageSize,
    );

    // 3. Create input tensor [1, 3, 224, 224]
    const tensor = new ort.Tensor('float32', preprocessed.data, [
      1, 3, this.config.imageSize, this.config.imageSize,
    ]);

    // 4. Run inference
    const feeds: Record<string, any> = {
      pixel_values: tensor,
    };
    const results = await this.session.run(feeds);

    // 5. Extract embedding from output
    const outputKey = Object.keys(results)[0];
    const outputTensor = results[outputKey];
    const rawEmbedding = outputTensor.data as Float32Array;

    // 6. Normalize to unit vector
    return this.l2Normalize(Array.from(rawEmbedding));
  }

  async getEmbeddings(fileUris: string[]): Promise<Embedding[]> {
    const results: Embedding[] = [];
    for (const uri of fileUris) {
      if (this.disposed) break;
      await this.checkThrottle();
      results.push(await this.getEmbedding(uri));
    }
    return results;
  }

  async dispose(): Promise<void> {
    if (this.session) {
      this.session.release();
      this.session = null;
    }
    await super.dispose();
  }

  private l2Normalize(vector: number[]): number[] {
    let norm = 0;
    for (const v of vector) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm === 0) return vector;
    return vector.map(v => v / norm);
  }
}
