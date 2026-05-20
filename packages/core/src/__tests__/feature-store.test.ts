import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryFeatureStore } from '../feature-store.js';
import type { PhotoRecord } from '../types.js';

const makeRecord = (id: string, label?: string): PhotoRecord => ({
  id,
  embedding: new Array(512).fill(0).map(() => Math.random()),
  createdAt: Date.now(),
  label,
});

describe('InMemoryFeatureStore', () => {
  let store: InMemoryFeatureStore;

  beforeEach(async () => {
    store = new InMemoryFeatureStore();
    await store.init();
  });

  it('save and getById', async () => {
    const record = makeRecord('photo-1');
    await store.save(record);
    const got = await store.getById('photo-1');
    expect(got).not.toBeNull();
    expect(got!.id).toBe('photo-1');
    expect(got!.embedding).toHaveLength(512);
  });

  it('getById returns null for missing id', async () => {
    expect(await store.getById('nope')).toBeNull();
  });

  it('saveBatch', async () => {
    await store.saveBatch([makeRecord('a'), makeRecord('b'), makeRecord('c')]);
    expect(await store.count()).toBe(3);
  });

  it('getUnclassified returns only unlabeled records', async () => {
    await store.saveBatch([
      makeRecord('a', 'trash'),
      makeRecord('b'),
      makeRecord('c', 'keep'),
      makeRecord('d'),
    ]);
    const unclassified = await store.getUnclassified();
    expect(unclassified).toHaveLength(2);
    expect(unclassified.map(r => r.id).sort()).toEqual(['b', 'd']);
  });

  it('getAll returns all records', async () => {
    await store.saveBatch([makeRecord('a'), makeRecord('b')]);
    const all = await store.getAll();
    expect(all).toHaveLength(2);
  });

  it('updateLabel', async () => {
    await store.save(makeRecord('photo-1'));
    await store.updateLabel('photo-1', 'trash', 0.95);
    const got = await store.getById('photo-1');
    expect(got!.label).toBe('trash');
    expect(got!.aiConfidence).toBe(0.95);
  });

  it('updateLabel throws for missing id', async () => {
    await expect(store.updateLabel('nope', 'trash')).rejects.toThrow('not found');
  });

  it('updateLabelsBatch', async () => {
    await store.saveBatch([makeRecord('a'), makeRecord('b')]);
    await store.updateLabelsBatch([
      { id: 'a', label: 'trash', aiConfidence: 0.9 },
      { id: 'b', label: 'keep', aiConfidence: 0.8 },
    ]);
    const a = await store.getById('a');
    const b = await store.getById('b');
    expect(a!.label).toBe('trash');
    expect(b!.label).toBe('keep');
  });

  it('deleteByIds', async () => {
    await store.saveBatch([makeRecord('a'), makeRecord('b'), makeRecord('c')]);
    await store.deleteByIds(['a', 'c']);
    expect(await store.count()).toBe(1);
    expect(await store.getById('a')).toBeNull();
    expect(await store.getById('b')).not.toBeNull();
  });

  it('count', async () => {
    expect(await store.count()).toBe(0);
    await store.save(makeRecord('a'));
    expect(await store.count()).toBe(1);
  });

  it('close clears all data', async () => {
    await store.save(makeRecord('a'));
    await store.close();
    expect(await store.count()).toBe(0);
  });

  it('getById returns a copy, not a reference', async () => {
    const record = makeRecord('photo-1');
    await store.save(record);
    const got = await store.getById('photo-1');
    got!.label = 'mutated';
    const gotAgain = await store.getById('photo-1');
    expect(gotAgain!.label).toBeUndefined();
  });
});
