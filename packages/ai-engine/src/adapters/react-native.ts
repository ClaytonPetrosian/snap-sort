/**
 * React Native adapter — uses onnxruntime-react-native for CLIP inference.
 *
 * Prerequisites:
 * - npm install onnxruntime-react-native
 * - Bundle the quantized CLIP model in the app's assets/
 *
 * TODO: Implement actual ONNX inference pipeline.
 * This is a scaffold showing the intended integration pattern.
 */
import type { Embedding } from '@smart-photo/core';
import { BaseEmbeddingAdapter } from '../base-adapter.js';
import type { EmbeddingConfig } from '../types.js';

const DEFAULT_CONFIG: Required<EmbeddingConfig> = {
  model: 'clip-vit-base-patch32',
  dimension: 512,
  imageSize: 224,
};

export class ReactNativeAdapter extends BaseEmbeddingAdapter {
  private config: Required<EmbeddingConfig>;
  private session: unknown = null;

  constructor(config: EmbeddingConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async init(): Promise<void> {
    // TODO: Load ONNX model from app bundle
    //
    // import { InferenceSession } from 'onnxruntime-react-native';
    //
    // const modelPath = `${FileSystem.bundlePath}/models/${this.config.model}.onnx`;
    // this.session = await InferenceSession.create(modelPath, {
    //   executionProviders: ['cpu'],
    // });
    //
    // Also load the tokenizer model if text embeddings are needed later.

    console.log(`[RN Adapter] Init CLIP model: ${this.config.model}`);
  }

  async getEmbedding(fileUri: string): Promise<Embedding> {
    if (!this.session) {
      throw new Error('Adapter not initialized. Call init() first.');
    }

    // TODO: Full implementation
    // 1. Read image from fileUri using expo-media-library or react-native-fs
    // 2. Resize to 224x224, normalize to [0,1], apply CLIP image transforms
    // 3. Create input tensor: Float32Array of shape [1, 3, 224, 224]
    // 4. Run inference: this.session.run({ pixel_values: tensor })
    // 5. Extract and return the 512-dim output embedding

    throw new Error('Not implemented: RN adapter getEmbedding()');
  }

  async dispose(): Promise<void> {
    // if (this.session) {
    //   (this.session as InferenceSession).release();
    //   this.session = null;
    // }
    await super.dispose();
  }
}
