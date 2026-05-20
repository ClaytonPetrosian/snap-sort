/**
 * React Native adapter — uses onnxruntime-react-native for CLIP inference.
 *
 * Prerequisites:
 *   npm install onnxruntime-react-native
 *
 * Model setup:
 *   Place the quantized ONNX model in: app/assets/models/clip-vit-base-patch32.onnx
 *   Use a quantized (INT8) model for mobile — typically ~60MB vs ~350MB for FP32.
 *
 * Image preprocessing uses expo-image-manipulator (already a common Expo dependency).
 *
 * Expected ONNX model:
 *   Input:  "pixel_values" — Float32[1, 3, 224, 224]
 *   Output: "image_embeds" — Float32[1, 512]
 */
import type { Embedding } from '@smart-photo/core';
import { BaseEmbeddingAdapter } from '../base-adapter.js';
import type { EmbeddingConfig } from '../types.js';
import { normalizeToCHW } from '../preprocess.js';

const DEFAULT_CONFIG: Required<EmbeddingConfig> = {
  model: 'clip-vit-base-patch32',
  dimension: 512,
  imageSize: 224,
};

export interface ReactNativeAdapterConfig extends EmbeddingConfig {
  /** Override model asset path */
  modelAssetPath?: string;
}

export class ReactNativeAdapter extends BaseEmbeddingAdapter {
  private config: Required<EmbeddingConfig>;
  private session: any = null;
  private modelPath: string;

  constructor(config: ReactNativeAdapterConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.modelPath = (config as ReactNativeAdapterConfig).modelAssetPath
      ?? `models/${this.config.model}.onnx`;
  }

  async init(): Promise<void> {
    // Dynamic import to avoid hard dependency
    let ort: any;
    try {
      ort = await import('onnxruntime-react-native');
    } catch {
      throw new Error(
        'onnxruntime-react-native is required for the React Native adapter.\n' +
        'Install it: npm install onnxruntime-react-native',
      );
    }

    this.session = await ort.InferenceSession.create(this.modelPath, {
      executionProviders: ['cpu'],
    });

    console.log(`[RN Adapter] CLIP model loaded: ${this.config.model}`);
  }

  async getEmbedding(fileUri: string): Promise<Embedding> {
    if (!this.session) {
      throw new Error('Adapter not initialized. Call init() first.');
    }

    const ort = await import('onnxruntime-react-native');

    // 1. Preprocess image
    const preprocessed = await this.preprocessImage(fileUri);

    // 2. Create input tensor [1, 3, 224, 224]
    const tensor = new ort.Tensor('float32', preprocessed.data, [
      1, 3, this.config.imageSize, this.config.imageSize,
    ]);

    // 3. Run inference
    const feeds: Record<string, any> = { pixel_values: tensor };
    const results = await this.session.run(feeds);

    // 4. Extract embedding
    const outputKey = Object.keys(results)[0];
    const rawEmbedding = results[outputKey].data as Float32Array;

    // 5. L2 normalize
    return this.l2Normalize(Array.from(rawEmbedding));
  }

  async dispose(): Promise<void> {
    if (this.session) {
      try {
        this.session.release();
      } catch {
        // Some platforms don't have release()
      }
      this.session = null;
    }
    await super.dispose();
  }

  /**
   * Preprocess an image for CLIP inference.
   * Uses expo-image-manipulator to resize, then normalizes to CHW.
   */
  private async preprocessImage(fileUri: string): Promise<{ data: Float32Array }> {
    const targetSize = this.config.imageSize;

    try {
      // Try expo-image-manipulator
      const ImageManipulator = await import('expo-image-manipulator');
      const FileSystem = await import('expo-file-system');

      const result = await ImageManipulator.manipulateAsync(
        fileUri,
        [{ resize: { width: targetSize, height: targetSize } }],
        {
          compress: 1,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );

      // Decode base64 to raw pixel data
      const base64 = result.base64 ?? '';
      const pixelData = this.base64ToUint8Array(base64);
      const preprocessed = normalizeToCHW(pixelData, targetSize, targetSize);
      return { data: preprocessed.data };
    } catch {
      // Fallback: read file directly as base64
      console.warn('[RN Adapter] expo-image-manipulator not available, using fallback');

      const FileSystem = await import('expo-file-system');
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const pixelData = this.base64ToUint8Array(base64);
      const preprocessed = normalizeToCHW(pixelData, targetSize, targetSize);
      return { data: preprocessed.data };
    }
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Uint8Array(256);
    for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

    const len = base64.length;
    const bufferLength = len * 0.75;
    const bytes = new Uint8Array(bufferLength);

    let p = 0;
    for (let i = 0; i < len; i += 4) {
      const a = lookup[base64.charCodeAt(i)];
      const b = lookup[base64.charCodeAt(i + 1)];
      const c = lookup[base64.charCodeAt(i + 2)];
      const d = lookup[base64.charCodeAt(i + 3)];

      bytes[p++] = (a << 2) | (b >> 4);
      if (base64[i + 2] !== '=') bytes[p++] = ((b & 15) << 4) | (c >> 2);
      if (base64[i + 3] !== '=') bytes[p++] = ((c & 3) << 6) | d;
    }

    return bytes.slice(0, p);
  }

  private l2Normalize(vector: number[]): number[] {
    let norm = 0;
    for (const v of vector) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm === 0) return vector;
    return vector.map(v => v / norm);
  }
}
