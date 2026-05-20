/**
 * Gemini Cloud AI adapter — uses Google's Gemini API for image embedding.
 *
 * This is an optional cloud fallback for faster initial processing.
 * The PRD specifies "offline-first", so this adapter is opt-in.
 *
 * When to use:
 * - User explicitly enables cloud AI in settings
 * - Device is on Wi-Fi and charging
 * - Initial batch processing where local CLIP is too slow
 *
 * API: Gemini multimodal embedding endpoint
 * Requires: GEMINI_API_KEY environment variable or config.apiKey
 */
import type { Embedding } from '@smart-photo/core';
import { BaseEmbeddingAdapter } from '../base-adapter.js';
import type { EmbeddingConfig } from '../types.js';

export interface GeminiAdapterConfig extends EmbeddingConfig {
  /** Gemini API key (required) */
  apiKey?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Max concurrent requests (default: 3) */
  maxConcurrency?: number;
}

const DEFAULT_GEMINI_CONFIG = {
  model: 'embedding-001',
  dimension: 768, // Gemini embedding dimension
  imageSize: 224,
  timeout: 30000,
  maxConcurrency: 3,
};

interface GeminiEmbeddingResponse {
  embedding: {
    values: number[];
  };
}

export class GeminiAdapter extends BaseEmbeddingAdapter {
  private config: typeof DEFAULT_GEMINI_CONFIG & { apiKey?: string };
  private geminiApiKey: string | null = null;

  constructor(config: GeminiAdapterConfig = {}) {
    super();
    this.config = { ...DEFAULT_GEMINI_CONFIG, ...config };
  }

  async init(): Promise<void> {
    // Get API key from config or environment
    this.geminiApiKey = this.config.apiKey
      ?? (typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : null)
      ?? null;

    if (!this.geminiApiKey) {
      throw new Error(
        'Gemini API key is required.\n' +
        'Set it in config.apiKey or GEMINI_API_KEY environment variable.\n' +
        'Get a key at: https://aistudio.google.com/apikey',
      );
    }

    console.log('[Gemini Adapter] Initialized with model:', this.config.model);
  }

  async getEmbedding(fileUri: string): Promise<Embedding> {
    if (!this.geminiApiKey) {
      throw new Error('Adapter not initialized. Call init() first.');
    }

    // Respect throttle
    await this.checkThrottle();

    // Read image as base64
    const base64 = await this.readImageAsBase64(fileUri);

    // Call Gemini embedding API
    const response = await this.callGeminiAPI(base64);

    // Normalize the embedding
    return this.l2Normalize(response.embedding.values);
  }

  async getEmbeddings(fileUris: string[]): Promise<Embedding[]> {
    const results: Embedding[] = [];
    const concurrency = this.config.maxConcurrency ?? 3;

    for (let i = 0; i < fileUris.length; i += concurrency) {
      await this.checkThrottle();
      if (this.disposed) break;

      const batch = fileUris.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(uri => this.getEmbedding(uri)),
      );
      results.push(...batchResults);
    }

    return results;
  }

  async dispose(): Promise<void> {
    this.geminiApiKey = null;
    await super.dispose();
  }

  private async callGeminiAPI(base64Image: string): Promise<GeminiEmbeddingResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:embedContent?key=${this.geminiApiKey}`;

    const body = {
      model: `models/${this.config.model}`,
      content: {
        parts: [
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Image,
            },
          },
        ],
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
      }

      return await response.json() as GeminiEmbeddingResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readImageAsBase64(fileUri: string): Promise<string> {
    const filePath = fileUri.replace(/^file:\/\//, '');

    if (typeof fetch !== 'undefined' && fileUri.startsWith('http')) {
      const response = await fetch(fileUri);
      const buffer = await response.arrayBuffer();
      return this.arrayBufferToBase64(buffer);
    }

    // Node.js filesystem
    try {
      const fs = await import('fs');
      const buffer = fs.readFileSync(filePath);
      return buffer.toString('base64');
    } catch {
      throw new Error(`Cannot read file: ${filePath}`);
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private l2Normalize(vector: number[]): number[] {
    let norm = 0;
    for (const v of vector) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm === 0) return vector;
    return vector.map(v => v / norm);
  }
}
