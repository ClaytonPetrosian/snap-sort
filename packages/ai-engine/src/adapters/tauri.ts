/**
 * Tauri adapter — delegates CLIP inference to the Rust backend via Tauri invoke.
 *
 * Architecture:
 * - Rust side uses `ort` crate (ONNX Runtime bindings) for fast native inference
 * - JS side calls Tauri commands for image processing and embedding extraction
 *
 * TODO: Implement Tauri command integration.
 * This scaffold shows the intended IPC pattern.
 */
import type { Embedding } from '@smart-photo/core';
import { BaseEmbeddingAdapter } from '../base-adapter.js';
import type { EmbeddingConfig } from '../types.js';

const DEFAULT_CONFIG: Required<EmbeddingConfig> = {
  model: 'clip-vit-base-patch32',
  dimension: 512,
  imageSize: 224,
};

export class TauriAdapter extends BaseEmbeddingAdapter {
  private config: Required<EmbeddingConfig>;

  constructor(config: EmbeddingConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async init(): Promise<void> {
    // TODO: Invoke Tauri command to load model on the Rust side
    //
    // import { invoke } from '@tauri-apps/api/tauri';
    // await invoke('init_clip_model', { model: this.config.model });

    console.log(`[Tauri Adapter] Init CLIP model: ${this.config.model}`);
  }

  async getEmbedding(fileUri: string): Promise<Embedding> {
    // TODO: Invoke Tauri command
    //
    // import { invoke } from '@tauri-apps/api/tauri';
    // const embedding = await invoke<number[]>('get_image_embedding', {
    //   filePath: fileUri.replace('file://', ''),
    // });
    // return embedding;

    throw new Error('Not implemented: Tauri adapter getEmbedding()');
  }

  async getEmbeddings(fileUris: string[]): Promise<Embedding[]> {
    // TODO: Batch invoke for better throughput
    //
    // const embeddings = await invoke<number[][]>('get_image_embeddings_batch', {
    //   filePaths: fileUris.map(u => u.replace('file://', '')),
    // });
    // return embeddings;

    throw new Error('Not implemented: Tauri adapter getEmbeddings()');
  }

  async dispose(): Promise<void> {
    // await invoke('dispose_clip_model');
    await super.dispose();
  }
}
