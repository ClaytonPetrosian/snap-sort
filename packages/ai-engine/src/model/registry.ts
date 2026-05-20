/**
 * Model registry — known CLIP ONNX models with download URLs.
 *
 * Models are sourced from Hugging Face ONNX exports.
 * The image encoder takes pixel_values [1,3,224,224] and outputs image_embeds [1,512].
 */

export interface ModelEntry {
  /** Unique model identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Model description */
  description: string;
  /** Download URL (Hugging Face or mirror) */
  url: string;
  /** Fallback mirror URL */
  fallbackUrl?: string;
  /** Expected file size in bytes (approximate) */
  sizeBytes: number;
  /** SHA-256 checksum for verification (optional) */
  sha256?: string;
  /** ONNX input name for pixel values */
  inputName: string;
  /** ONNX output name for embeddings */
  outputName: string;
  /** Embedding dimension */
  dimension: number;
  /** Input image size */
  imageSize: number;
}

/** Registry of available CLIP ONNX models */
export const MODEL_REGISTRY: Record<string, ModelEntry> = {
  'clip-vit-base-patch32': {
    id: 'clip-vit-base-patch32',
    name: 'CLIP ViT-B/32',
    description: 'OpenAI CLIP ViT-B/32 image encoder — best quality, larger model',
    url: 'https://huggingface.co/onnx-models/clip-vit-base-patch32/resolve/main/onnx/model.onnx',
    fallbackUrl: 'https://hf-mirror.com/onnx-models/clip-vit-base-patch32/resolve/main/onnx/model.onnx',
    sizeBytes: 351_000_000, // ~351 MB
    inputName: 'pixel_values',
    outputName: 'image_embeds',
    dimension: 512,
    imageSize: 224,
  },

  'clip-vit-base-patch32-text': {
    id: 'clip-vit-base-patch32-text',
    name: 'CLIP ViT-B/32 (Image Only)',
    description: 'CLIP ViT-B/32 image encoder extracted from full model',
    url: 'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model.onnx',
    fallbackUrl: 'https://hf-mirror.com/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model.onnx',
    sizeBytes: 351_000_000,
    inputName: 'pixel_values',
    outputName: 'image_embeds',
    dimension: 512,
    imageSize: 224,
  },

  'mobileclip-s0': {
    id: 'mobileclip-s0',
    name: 'MobileCLIP S0',
    description: 'Lightweight CLIP for mobile — fast inference, smaller model',
    url: 'https://huggingface.co/apple/mobileclip-s0/resolve/main/onnx/image_encoder.onnx',
    sizeBytes: 87_000_000, // ~87 MB
    inputName: 'pixel_values',
    outputName: 'image_embeds',
    dimension: 512,
    imageSize: 256,
  },
};

/** Get a model entry by ID, or throw if not found */
export function getModel(id: string): ModelEntry {
  const entry = MODEL_REGISTRY[id];
  if (!entry) {
    const available = Object.keys(MODEL_REGISTRY).join(', ');
    throw new Error(`Unknown model: ${id}. Available models: ${available}`);
  }
  return entry;
}

/** List all available model IDs */
export function listModels(): string[] {
  return Object.keys(MODEL_REGISTRY);
}
