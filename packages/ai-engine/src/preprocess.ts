/**
 * CLIP image preprocessing utilities.
 *
 * Standard CLIP ViT-B/32 preprocessing:
 * 1. Resize shortest edge to 224px, center-crop to 224x224
 * 2. Convert to float32 [0, 1]
 * 3. Normalize with ImageNet mean/std
 * 4. Rearrange to CHW (channel-first) format
 *
 * This module provides a platform-agnostic Float32Array output.
 * Platform adapters supply the actual image decoding (sharp, expo-image-manipulator, etc).
 */

/** ImageNet normalization constants used by CLIP */
export const IMAGENET_MEAN = [0.48145466, 0.4578275, 0.40821073];
export const IMAGENET_STD = [0.26862954, 0.26130258, 0.27577711];

export interface PreprocessedImage {
  /** CHW Float32Array, length = 3 * 224 * 224 = 150528 */
  data: Float32Array;
  /** Always 224 for CLIP ViT-B/32 */
  width: number;
  /** Always 224 for CLIP ViT-B/32 */
  height: number;
}

/**
 * Normalize RGB pixel data (HWC, 0-255) to CLIP-standard CHW Float32Array.
 *
 * @param pixels - Raw RGB pixel data in HWC format (height * width * 3)
 * @param width - Image width (should be 224)
 * @param height - Image height (should be 224)
 * @returns PreprocessedImage with CHW Float32Array
 */
export function normalizeToCHW(
  pixels: Uint8Array | Float32Array,
  width: number,
  height: number,
): PreprocessedImage {
  const chw = new Float32Array(3 * width * height);
  // Uint8Array values are 0-255, Float32Array values are typically 0-1
  const needsScale = pixels instanceof Uint8Array;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const hwcIndex = (y * width + x) * 3;
      const chwIndex = y * width + x;

      for (let c = 0; c < 3; c++) {
        // Normalize to [0, 1]
        const raw = pixels[hwcIndex + c];
        const pixel = needsScale ? raw / 255.0 : raw;
        // Apply ImageNet normalization
        const normalized = (pixel - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
        // Store in CHW format: channel * (H*W) + pixel_index
        chw[c * width * height + chwIndex] = normalized;
      }
    }
  }

  return { data: chw, width, height };
}

/**
 * Center-crop and resize an image to 224x224.
 * This is a pure-math helper — actual pixel manipulation is done by platform-specific libraries.
 *
 * @param srcWidth - Source image width
 * @param srcHeight - Source image height
 * @param targetSize - Target size (default: 224)
 * @returns Crop rectangle and resize dimensions
 */
export function computeCenterCrop(
  srcWidth: number,
  srcHeight: number,
  targetSize = 224,
): { cropX: number; cropY: number; cropSize: number; resizeW: number; resizeH: number } {
  const shorter = Math.min(srcWidth, srcHeight);

  // Resize so shorter side = targetSize
  const scale = targetSize / shorter;
  const resizeW = Math.round(srcWidth * scale);
  const resizeH = Math.round(srcHeight * scale);

  // Center crop to targetSize x targetSize
  const cropX = Math.max(0, Math.floor((resizeW - targetSize) / 2));
  const cropY = Math.max(0, Math.floor((resizeH - targetSize) / 2));

  return { cropX, cropY, cropSize: targetSize, resizeW, resizeH };
}
