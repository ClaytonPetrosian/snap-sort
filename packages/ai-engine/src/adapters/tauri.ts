/**
 * Tauri adapter — delegates CLIP inference to the Rust backend via Tauri invoke.
 *
 * Architecture:
 * - Rust side uses `ort` crate (ONNX Runtime bindings) for fast native inference
 * - JS side calls Tauri commands for image processing and embedding extraction
 *
 * Dependencies (install in the desktop package):
 *   npm install @tauri-apps/api
 *
 * The Tauri backend must register these commands:
 *   - init_clip_model(modelPath: string) -> ModelInfo
 *   - get_image_embedding(filePath: string) -> EmbeddingResult
 *   - get_image_embeddings_batch(filePaths: string[]) -> BatchEmbeddingResult
 */
import type { Embedding } from '@smart-photo/core';
import { BaseEmbeddingAdapter } from '../base-adapter.js';
import type { EmbeddingConfig } from '../types.js';

/** Dynamic import for @tauri-apps/api (optional dependency) */
const dynamicImport = (id: string) => import(/* @vite-ignore */ id);

let _invoke: any = null;

async function loadInvoke(): Promise<any> {
  if (!_invoke) {
    try {
      const tauri = await dynamicImport('@tauri-apps/api/tauri');
      _invoke = tauri.invoke;
    } catch {
      throw new Error(
        '@tauri-apps/api is required for the Tauri adapter.\n' +
        'Install it: npm install @tauri-apps/api\n' +
        'This adapter only works inside a Tauri application.',
      );
    }
  }
  return _invoke;
}

const DEFAULT_CONFIG: Required<EmbeddingConfig> = {
  model: 'clip-vit-base-patch32',
  dimension: 512,
  imageSize: 224,
};

export interface TauriAdapterConfig extends EmbeddingConfig {
  /** Path to ONNX model file on the host system */
  modelPath?: string;
}

export class TauriAdapter extends BaseEmbeddingAdapter {
  private config: Required<EmbeddingConfig> & { modelPath?: string };

  constructor(config: TauriAdapterConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async init(): Promise<void> {
    const invoke = await loadInvoke();

    const modelPath = this.config.modelPath
      ?? `./models/${this.config.model}.onnx`;

    try {
      await invoke('init_clip_model', { modelPath });
    } catch (err) {
      throw new Error(
        `Failed to initialize CLIP model via Tauri: ${err instanceof Error ? err.message : err}`,
      );
    }

    console.log(`[Tauri Adapter] CLIP model initialized: ${modelPath}`);
  }

  async getEmbedding(fileUri: string): Promise<Embedding> {
    const invoke = await loadInvoke();
    const filePath = fileUri.replace(/^file:\/\//, '');

    try {
      const result = await invoke(
        'get_image_embedding',
        { filePath },
      ) as { embedding: number[]; dimension: number };
      return result.embedding;
    } catch (err) {
      throw new Error(
        `Tauri embedding failed for ${filePath}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async getEmbeddings(fileUris: string[]): Promise<Embedding[]> {
    const invoke = await loadInvoke();
    const filePaths = fileUris.map(u => u.replace(/^file:\/\//, ''));

    try {
      const result = await invoke(
        'get_image_embeddings_batch',
        { filePaths },
      ) as { embeddings: number[][]; count: number; errors: string[] };

      if (result.errors.length > 0) {
        console.warn(`[Tauri Adapter] ${result.errors.length} errors during batch inference:`,
          result.errors);
      }

      return result.embeddings;
    } catch (err) {
      // Fallback to sequential if batch not supported
      console.warn('[Tauri Adapter] Batch invoke failed, falling back to sequential');
      return super.getEmbeddings(fileUris);
    }
  }

  async dispose(): Promise<void> {
    await super.dispose();
  }
}
