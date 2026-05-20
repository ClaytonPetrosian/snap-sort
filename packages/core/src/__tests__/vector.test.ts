import { describe, it, expect } from 'vitest';
import {
  euclideanDistance,
  cosineSimilarity,
  normalizeInPlace,
  zeros,
  add,
  scale,
  centroid,
} from '../vector.js';

describe('vector math', () => {
  it('euclideanDistance: same vector = 0', () => {
    const v = [1, 2, 3];
    expect(euclideanDistance(v, v)).toBe(0);
  });

  it('euclideanDistance: orthogonal vectors', () => {
    expect(euclideanDistance([1, 0], [0, 1])).toBeCloseTo(Math.SQRT2);
  });

  it('euclideanDistance: throws on dimension mismatch', () => {
    expect(() => euclideanDistance([1, 2], [1])).toThrow('dimension mismatch');
  });

  it('cosineSimilarity: same vector = 1', () => {
    const v = [3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it('cosineSimilarity: orthogonal vectors = 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('cosineSimilarity: opposite vectors = -1', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('cosineSimilarity: throws on dimension mismatch', () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow('dimension mismatch');
  });

  it('normalizeInPlace: normalizes to unit vector', () => {
    const v = [3, 4];
    normalizeInPlace(v);
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
  });

  it('normalizeInPlace: zero vector stays zero', () => {
    const v = [0, 0];
    normalizeInPlace(v);
    expect(v).toEqual([0, 0]);
  });

  it('zeros', () => {
    expect(zeros(3)).toEqual([0, 0, 0]);
  });

  it('add', () => {
    expect(add([1, 2], [3, 4])).toEqual([4, 6]);
  });

  it('scale', () => {
    expect(scale([1, 2, 3], 2)).toEqual([2, 4, 6]);
  });

  it('centroid', () => {
    const result = centroid([[1, 0], [0, 1], [-1, 0]]);
    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(1 / 3);
  });

  it('centroid: empty set throws', () => {
    expect(() => centroid([])).toThrow('empty set');
  });
});
