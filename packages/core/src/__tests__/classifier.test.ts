import { describe, it, expect } from 'vitest';
import { KNNClassifier } from '../classifier.js';

describe('KNNClassifier', () => {
  it('starts empty', () => {
    const clf = new KNNClassifier();
    expect(clf.sampleCount).toBe(0);
  });

  it('addSample increases count', () => {
    const clf = new KNNClassifier();
    clf.addSample([1, 0, 0], 'keep');
    clf.addSample([0, 1, 0], 'trash');
    expect(clf.sampleCount).toBe(2);
  });

  it('removeLastSample undoes last add', () => {
    const clf = new KNNClassifier();
    clf.addSample([1, 0, 0], 'keep');
    clf.addSample([0, 1, 0], 'trash');
    const removed = clf.removeLastSample();
    expect(removed).toEqual({ embedding: [0, 1, 0], label: 'trash' });
    expect(clf.sampleCount).toBe(1);
  });

  it('removeLastSample returns null when empty', () => {
    const clf = new KNNClassifier();
    expect(clf.removeLastSample()).toBeNull();
  });

  it('predict: classifies clearly distinct clusters', () => {
    const clf = new KNNClassifier({ k: 3 });
    // Cluster "trash": vectors near [1, 0]
    clf.addSample([1, 0], 'trash');
    clf.addSample([0.9, 0.1], 'trash');
    clf.addSample([1, -0.1], 'trash');
    // Cluster "keep": vectors near [0, 1]
    clf.addSample([0, 1], 'keep');
    clf.addSample([0.1, 0.9], 'keep');
    clf.addSample([-0.1, 1], 'keep');

    // Test point near trash cluster
    const pred1 = clf.predict([0.95, 0.05]);
    expect(pred1.label).toBe('trash');
    expect(pred1.confidence).toBeGreaterThan(0.7);

    // Test point near keep cluster
    const pred2 = clf.predict([0.05, 0.95]);
    expect(pred2.label).toBe('keep');
    expect(pred2.confidence).toBeGreaterThan(0.7);
  });

  it('predict: throws when no samples', () => {
    const clf = new KNNClassifier();
    expect(() => clf.predict([1, 0])).toThrow('no training samples');
  });

  it('getLabelCounts', () => {
    const clf = new KNNClassifier();
    clf.addSample([1, 0], 'trash');
    clf.addSample([0, 1], 'keep');
    clf.addSample([0, 0.5], 'keep');
    expect(clf.getLabelCounts()).toEqual({ trash: 1, keep: 2 });
  });

  it('exportSamples and importSamples roundtrip', () => {
    const clf = new KNNClassifier();
    clf.addSample([1, 0], 'trash');
    clf.addSample([0, 1], 'keep');

    const exported = clf.exportSamples();
    expect(exported).toHaveLength(2);

    const clf2 = new KNNClassifier();
    clf2.importSamples(exported);
    expect(clf2.sampleCount).toBe(2);

    const pred = clf2.predict([0.9, 0.1]);
    expect(pred.label).toBe('trash');
  });

  it('confidence is between 0 and 1', () => {
    const clf = new KNNClassifier();
    clf.addSample([1, 0], 'a');
    clf.addSample([0, 1], 'b');
    clf.addSample([0.5, 0.5], 'a');

    const pred = clf.predict([0.3, 0.7]);
    expect(pred.confidence).toBeGreaterThanOrEqual(0);
    expect(pred.confidence).toBeLessThanOrEqual(1);
  });
});
