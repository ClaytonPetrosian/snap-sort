import { describe, it, expect } from 'vitest';
import { KNNClassifier } from '../classifier.js';
import { UncertaintySampler, selectBatch } from '../active-learning.js';

describe('UncertaintySampler', () => {
  it('returns random index when classifier has no samples', () => {
    const sampler = new UncertaintySampler();
    const clf = new KNNClassifier();
    const unclassified = [[1, 0], [0, 1], [0.5, 0.5]];

    const result = sampler.selectNext(unclassified, clf);
    expect(result).not.toBeNull();
    expect(result!.index).toBeGreaterThanOrEqual(0);
    expect(result!.index).toBeLessThan(3);
    expect(result!.expectedConfidence).toBe(0.5);
  });

  it('returns null for empty unclassified array', () => {
    const sampler = new UncertaintySampler();
    const clf = new KNNClassifier();
    clf.addSample([1, 0], 'a');

    expect(sampler.selectNext([], clf)).toBeNull();
  });

  it('selects the most uncertain sample', () => {
    const sampler = new UncertaintySampler();
    const clf = new KNNClassifier({ k: 3 });

    // Clear clusters
    for (let i = 0; i < 5; i++) {
      clf.addSample([1 + Math.random() * 0.1, 0], 'trash');
      clf.addSample([0, 1 + Math.random() * 0.1], 'keep');
    }

    // Three test points:
    // 0: clearly trash → high confidence
    // 1: clearly keep → high confidence
    // 2: ambiguous (between clusters) → should be selected
    const unclassified = [
      [0.95, 0.05],  // clearly trash
      [0.05, 0.95],  // clearly keep
      [0.5, 0.5],    // ambiguous — should be selected
    ];

    const result = sampler.selectNext(unclassified, clf);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(2); // Should pick the ambiguous one
  });
});

describe('selectBatch', () => {
  it('returns batch of uncertain samples', () => {
    const clf = new KNNClassifier({ k: 3 });
    for (let i = 0; i < 5; i++) {
      clf.addSample([1, 0], 'a');
      clf.addSample([0, 1], 'b');
    }

    const unclassified = [[0.9, 0.1], [0.5, 0.5], [0.1, 0.9], [0.6, 0.4]];
    const batch = selectBatch(unclassified, clf, 2);

    expect(batch).toHaveLength(2);
    // The most uncertain ones should be selected first
    expect(batch[0].index).toBe(1); // [0.5, 0.5] is most uncertain
  });

  it('random fallback when no samples', () => {
    const clf = new KNNClassifier();
    const unclassified = [[1, 0], [0, 1], [0.5, 0.5]];
    const batch = selectBatch(unclassified, clf, 2);

    expect(batch).toHaveLength(2);
    batch.forEach(b => expect(b.expectedConfidence).toBe(0.5));
  });
});
