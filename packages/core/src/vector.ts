/**
 * Vector math utilities for embedding operations.
 * Pure functions, no side effects, zero dependencies.
 */
import type { Embedding } from './types.js';

/** Compute Euclidean distance between two vectors */
export function euclideanDistance(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Compute cosine similarity between two vectors (returns -1 to 1) */
export function cosineSimilarity(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dotProduct / denom;
}

/** L2-normalize a vector in place, returns the same array */
export function normalizeInPlace(v: Embedding): Embedding {
  let norm = 0;
  for (let i = 0; i < v.length; i++) {
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return v;
  for (let i = 0; i < v.length; i++) {
    v[i] /= norm;
  }
  return v;
}

/** Create a zero vector of given dimension */
export function zeros(dimension: number): Embedding {
  return new Array(dimension).fill(0);
}

/** Element-wise addition of two vectors */
export function add(a: Embedding, b: Embedding): Embedding {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  const result = new Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] + b[i];
  }
  return result;
}

/** Scalar multiply */
export function scale(v: Embedding, s: number): Embedding {
  const result = new Array(v.length);
  for (let i = 0; i < v.length; i++) {
    result[i] = v[i] * s;
  }
  return result;
}

/** Compute centroid (mean) of a set of vectors */
export function centroid(vectors: Embedding[]): Embedding {
  if (vectors.length === 0) throw new Error('Cannot compute centroid of empty set');
  const dim = vectors[0].length;
  const result = zeros(dim);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) {
      result[i] += v[i];
    }
  }
  const n = vectors.length;
  for (let i = 0; i < dim; i++) {
    result[i] /= n;
  }
  return result;
}
