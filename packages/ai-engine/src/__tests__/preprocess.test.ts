import { describe, it, expect } from 'vitest';
import {
  normalizeToCHW,
  computeCenterCrop,
  IMAGENET_MEAN,
  IMAGENET_STD,
} from '../preprocess.js';

describe('normalizeToCHW', () => {
  it('converts HWC to CHW format', () => {
    // 2x2 image, all pixels are (128, 128, 128)
    const pixels = new Uint8Array([
      128, 128, 128,  128, 128, 128,
      128, 128, 128,  128, 128, 128,
    ]);
    const result = normalizeToCHW(pixels, 2, 2);

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.data.length).toBe(3 * 2 * 2); // 12 values

    // All pixels same → each channel should have the same value
    const channelR = result.data.slice(0, 4);   // First channel (R)
    const channelG = result.data.slice(4, 8);   // Second channel (G)
    const channelB = result.data.slice(8, 12);  // Third channel (B)

    // 128/255 ≈ 0.502
    const expectedR = (128 / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    const expectedG = (128 / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    const expectedB = (128 / 255 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];

    for (let i = 0; i < 4; i++) {
      expect(channelR[i]).toBeCloseTo(expectedR, 5);
      expect(channelG[i]).toBeCloseTo(expectedG, 5);
      expect(channelB[i]).toBeCloseTo(expectedB, 5);
    }
  });

  it('handles pure black pixel (0,0,0)', () => {
    const pixels = new Uint8Array([0, 0, 0]);
    const result = normalizeToCHW(pixels, 1, 1);

    // (0/255 - mean) / std
    for (let c = 0; c < 3; c++) {
      const expected = (0 - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
      expect(result.data[c]).toBeCloseTo(expected, 5);
    }
  });

  it('handles pure white pixel (255,255,255)', () => {
    const pixels = new Uint8Array([255, 255, 255]);
    const result = normalizeToCHW(pixels, 1, 1);

    // (255/255 - mean) / std = (1 - mean) / std
    for (let c = 0; c < 3; c++) {
      const expected = (1 - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
      expect(result.data[c]).toBeCloseTo(expected, 5);
    }
  });

  it('preserves spatial layout in CHW format', () => {
    // 2x2 image with distinct pixels
    const pixels = new Uint8Array([
      100, 0, 0,    0, 100, 0,
      0, 0, 100,    200, 200, 200,
    ]);
    const result = normalizeToCHW(pixels, 2, 2);

    // R channel should have: [100, 0, 0, 200] normalized
    const r0 = (100 / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    const r1 = (0 / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    const r2 = (0 / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    const r3 = (200 / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];

    expect(result.data[0]).toBeCloseTo(r0, 5); // pixel (0,0) R
    expect(result.data[1]).toBeCloseTo(r1, 5); // pixel (0,1) R
    expect(result.data[2]).toBeCloseTo(r2, 5); // pixel (1,0) R
    expect(result.data[3]).toBeCloseTo(r3, 5); // pixel (1,1) R

    // G channel: [0, 100, 0, 200] normalized (offset by 4)
    const g1 = (100 / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    expect(result.data[5]).toBeCloseTo(g1, 5); // pixel (0,1) G
  });

  it('works with Float32Array input', () => {
    const pixels = new Float32Array([0.5, 0.5, 0.5]);
    const result = normalizeToCHW(pixels, 1, 1);

    // (0.5 - mean) / std
    for (let c = 0; c < 3; c++) {
      const expected = (0.5 - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
      expect(result.data[c]).toBeCloseTo(expected, 5);
    }
  });
});

describe('computeCenterCrop', () => {
  it('handles square image', () => {
    const result = computeCenterCrop(224, 224);
    expect(result.resizeW).toBe(224);
    expect(result.resizeH).toBe(224);
    expect(result.cropX).toBe(0);
    expect(result.cropY).toBe(0);
    expect(result.cropSize).toBe(224);
  });

  it('handles landscape image', () => {
    const result = computeCenterCrop(1000, 500);
    // Short side = 500, scale = 224/500 = 0.448
    expect(result.resizeW).toBe(448);
    expect(result.resizeH).toBe(224);
    expect(result.cropX).toBe(112); // (448 - 224) / 2
    expect(result.cropY).toBe(0);
  });

  it('handles portrait image', () => {
    const result = computeCenterCrop(500, 1000);
    expect(result.resizeW).toBe(224);
    expect(result.resizeH).toBe(448);
    expect(result.cropX).toBe(0);
    expect(result.cropY).toBe(112);
  });

  it('respects custom target size', () => {
    const result = computeCenterCrop(400, 300, 128);
    // Short side = 300, scale = 128/300
    expect(result.cropSize).toBe(128);
  });
});

describe('IMAGENET constants', () => {
  it('has 3 values for mean and std', () => {
    expect(IMAGENET_MEAN.length).toBe(3);
    expect(IMAGENET_STD.length).toBe(3);
  });

  it('mean values are in [0, 1]', () => {
    for (const v of IMAGENET_MEAN) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('std values are positive', () => {
    for (const v of IMAGENET_STD) {
      expect(v).toBeGreaterThan(0);
    }
  });
});
