import { describe, it, expect, beforeEach } from 'vitest';
import { SQLiteFeatureStore } from '../sqlite-store.js';
import type { SQLiteDatabaseAdapter } from '../sqlite-store.js';
import type { PhotoRecord } from '../types.js';

/**
 * In-memory SQLite adapter for testing.
 * Simulates SQLite behavior without an actual database.
 */
class MockSqliteAdapter implements SQLiteDatabaseAdapter {
  private tables: Map<string, Map<string, Record<string, unknown>>> = new Map();
  private indexes: Set<string> = new Set();

  exec(sql: string): void {
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith('CREATE TABLE')) {
      const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
      if (match) {
        this.tables.set(match[1], new Map());
      }
    } else if (trimmed.startsWith('CREATE INDEX')) {
      this.indexes.add(sql);
    }
  }

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const trimmed = sql.trim().toUpperCase();

    if (trimmed.startsWith('SELECT COUNT(*)')) {
      const photos = this.tables.get('photos');
      return [{ count: photos?.size ?? 0 }] as T[];
    }

    if (trimmed.startsWith('SELECT * FROM PHOTOS WHERE ID = ?')) {
      const photos = this.tables.get('photos');
      if (!photos) return [];
      const row = photos.get(params[0] as string);
      return row ? [row as T] : [];
    }

    if (trimmed.startsWith('SELECT * FROM PHOTOS WHERE LABEL IS NULL')) {
      const photos = this.tables.get('photos');
      if (!photos) return [];
      const results: T[] = [];
      for (const row of photos.values()) {
        if (row.label === null || row.label === undefined) {
          results.push(row as T);
        }
      }
      return results.sort((a: any, b: any) => a.created_at - b.created_at);
    }

    if (trimmed.startsWith('SELECT * FROM PHOTOS')) {
      const photos = this.tables.get('photos');
      if (!photos) return [];
      return Array.from(photos.values()).sort((a: any, b: any) => a.created_at - b.created_at) as T[];
    }

    if (trimmed.startsWith('SELECT LABEL, COUNT(*)')) {
      const photos = this.tables.get('photos');
      if (!photos) return [];
      const counts = new Map<string | null, number>();
      for (const row of photos.values()) {
        const label = (row.label as string) ?? null;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      const results: T[] = [];
      for (const [label, count] of counts) {
        results.push({ label, count } as T);
      }
      return results;
    }

    return [];
  }

  run(sql: string, params: unknown[] = []): { changes: number } {
    const trimmed = sql.trim().toUpperCase();

    if (trimmed.startsWith('INSERT OR REPLACE')) {
      const photos = this.tables.get('photos');
      if (!photos) return { changes: 0 };
      photos.set(params[0] as string, {
        id: params[0],
        hash: params[1],
        embedding: params[2],
        created_at: params[3],
        label: params[4],
        ai_confidence: params[5],
        updated_at: params[6],
      });
      return { changes: 1 };
    }

    if (trimmed.startsWith('UPDATE PHOTOS')) {
      const photos = this.tables.get('photos');
      if (!photos) return { changes: 0 };
      const row = photos.get(params[3] as string);
      if (!row) return { changes: 0 };
      row.label = params[0];
      row.ai_confidence = params[1];
      row.updated_at = params[2];
      return { changes: 1 };
    }

    if (trimmed.startsWith('DELETE FROM PHOTOS')) {
      const photos = this.tables.get('photos');
      if (!photos) return { changes: 0 };
      const existed = photos.has(params[0] as string);
      photos.delete(params[0] as string);
      return { changes: existed ? 1 : 0 };
    }

    return { changes: 0 };
  }
}

const makeRecord = (id: string, label?: string): PhotoRecord => ({
  id,
  embedding: new Array(512).fill(0).map(() => Math.random()),
  createdAt: Date.now(),
  label,
});

describe('SQLiteFeatureStore', () => {
  let adapter: MockSqliteAdapter;
  let store: SQLiteFeatureStore;

  beforeEach(async () => {
    adapter = new MockSqliteAdapter();
    store = new SQLiteFeatureStore(adapter);
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

  it('embedding roundtrip preserves data', async () => {
    const embedding = [0.1, -0.5, 0.999, 0.0, -1.0, 3.14159];
    const fullEmbedding = [...embedding, ...new Array(506).fill(0)];
    await store.save({
      id: 'test',
      embedding: fullEmbedding,
      createdAt: 1000,
    });
    const got = await store.getById('test');
    // Float32 precision — check first few values
    expect(got!.embedding[0]).toBeCloseTo(0.1, 5);
    expect(got!.embedding[1]).toBeCloseTo(-0.5, 5);
    expect(got!.embedding[2]).toBeCloseTo(0.999, 5);
  });
});
