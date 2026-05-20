/**
 * Active Learning strategy: Uncertainty Sampling.
 * Selects the sample whose predicted confidence is closest to 50%,
 * maximizing information gain per label.
 */
import type { Embedding, IClassifier, IActiveLearner } from './types.js';

export class UncertaintySampler implements IActiveLearner {
  /**
   * Select the next sample to present to the user.
   * Picks the one where the classifier is most uncertain (confidence ≈ 0.5).
   *
   * @returns index into unclassified array and the predicted confidence,
   *          or null if unclassified is empty or classifier has no samples.
   */
  selectNext(
    unclassified: Embedding[],
    classifier: IClassifier,
  ): { index: number; expectedConfidence: number } | null {
    if (unclassified.length === 0) return null;
    if (classifier.sampleCount === 0) {
      // No training data yet — return random sample
      const index = Math.floor(Math.random() * unclassified.length);
      return { index, expectedConfidence: 0.5 };
    }

    let bestIndex = -1;
    let bestUncertainty = -Infinity; // higher = more uncertain = better to show
    let bestConfidence = 0.5;

    for (let i = 0; i < unclassified.length; i++) {
      const prediction = classifier.predict(unclassified[i]);
      // Uncertainty = 1 - |confidence - 0.5| * 2
      // Range: 0 (very confident) to 1 (maximally uncertain)
      const uncertainty = 1 - Math.abs(prediction.confidence - 0.5) * 2;

      if (uncertainty > bestUncertainty) {
        bestUncertainty = uncertainty;
        bestIndex = i;
        bestConfidence = prediction.confidence;
      }
    }

    if (bestIndex === -1) return null;
    return { index: bestIndex, expectedConfidence: bestConfidence };
  }
}

/**
 * Batch uncertainty sampling — selects top N most uncertain samples.
 * Useful for preloading the card stack.
 */
export function selectBatch(
  unclassified: Embedding[],
  classifier: IClassifier,
  batchSize: number,
): Array<{ index: number; expectedConfidence: number }> {
  if (unclassified.length === 0 || classifier.sampleCount === 0) {
    // Random shuffle fallback
    const indices = unclassified.map((_, i) => i);
    shuffleInPlace(indices);
    return indices.slice(0, batchSize).map(index => ({ index, expectedConfidence: 0.5 }));
  }

  const scored = unclassified.map((embedding, index) => {
    const prediction = classifier.predict(embedding);
    const uncertainty = 1 - Math.abs(prediction.confidence - 0.5) * 2;
    return { index, uncertainty, confidence: prediction.confidence };
  });

  // Sort by uncertainty descending
  scored.sort((a, b) => b.uncertainty - a.uncertainty);

  return scored.slice(0, batchSize).map(s => ({
    index: s.index,
    expectedConfidence: s.confidence,
  }));
}

function shuffleInPlace(arr: number[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
