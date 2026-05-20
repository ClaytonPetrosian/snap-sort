/**
 * K-Nearest Neighbors classifier with distance-weighted voting.
 * Pure JS, no dependencies. Implements IClassifier interface.
 */
import type { Embedding, Label, Prediction, LabeledSample, IClassifier } from './types.js';
import { cosineSimilarity } from './vector.js';

export interface KNNClassifierOptions {
  /** Number of neighbors to consider (default: 5) */
  k?: number;
  /** Distance metric: 'cosine' | 'euclidean' (default: 'cosine') */
  metric?: 'cosine' | 'euclidean';
}

export class KNNClassifier implements IClassifier {
  private samples: LabeledSample[] = [];
  private readonly k: number;
  private readonly metric: 'cosine' | 'euclidean';

  constructor(options: KNNClassifierOptions = {}) {
    this.k = options.k ?? 5;
    this.metric = options.metric ?? 'cosine';
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  addSample(embedding: Embedding, label: Label): void {
    this.samples.push({ embedding, label });
  }

  removeLastSample(): LabeledSample | null {
    return this.samples.pop() ?? null;
  }

  predict(targetEmbedding: Embedding): Prediction {
    if (this.samples.length === 0) {
      throw new Error('Cannot predict: no training samples. Call addSample() first.');
    }

    // Compute distance/similarity to every labeled sample
    const scored = this.samples.map((sample, index) => {
      const similarity = this.metric === 'cosine'
        ? cosineSimilarity(targetEmbedding, sample.embedding)
        : -this.euclideanDist(targetEmbedding, sample.embedding); // negate so higher = closer
      return { index, similarity, label: sample.label };
    });

    // Sort by similarity descending (most similar first)
    scored.sort((a, b) => b.similarity - a.similarity);

    // Take top K
    const k = Math.min(this.k, scored.length);
    const neighbors = scored.slice(0, k);

    // Distance-weighted voting
    // Weight = similarity (already 0..1 for cosine, or negative distance for euclidean)
    const labelScores: Record<string, number> = {};
    let totalWeight = 0;

    for (const neighbor of neighbors) {
      // Shift similarity to [0, 1] range for weight
      const weight = this.metric === 'cosine'
        ? (neighbor.similarity + 1) / 2  // cosine: [-1,1] → [0,1]
        : 1 / (1 + Math.abs(neighbor.similarity)); // euclidean: distance → weight

      labelScores[neighbor.label] = (labelScores[neighbor.label] ?? 0) + weight;
      totalWeight += weight;
    }

    // Find winning label
    let bestLabel = '';
    let bestScore = -Infinity;
    for (const [label, score] of Object.entries(labelScores)) {
      if (score > bestScore) {
        bestScore = score;
        bestLabel = label;
      }
    }

    // Confidence = winning label's vote proportion
    const confidence = totalWeight > 0 ? bestScore / totalWeight : 0;

    return {
      label: bestLabel,
      confidence: Math.min(1, Math.max(0, confidence)),
    };
  }

  getLabelCounts(): Record<Label, number> {
    const counts: Record<string, number> = {};
    for (const sample of this.samples) {
      counts[sample.label] = (counts[sample.label] ?? 0) + 1;
    }
    return counts;
  }

  exportSamples(): LabeledSample[] {
    return [...this.samples];
  }

  importSamples(samples: LabeledSample[]): void {
    this.samples = [...samples];
  }

  private euclideanDist(a: Embedding, b: Embedding): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }
}
