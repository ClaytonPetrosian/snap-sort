/**
 * SQLite-backed FeatureStore implementation.
 *
 * Takes a generic DB adapter so it works with:
 * - better-sqlite3 (Node.js / Tauri backend)
 * - expo-sqlite (React Native)
 * - sql.js (browser / WASM)
 *
 * Usage:
 *   import Database from 'better-sqlite3';
 *   const db = new Database('photos.db');
 *   const store = new SQLiteFeatureStore(dbAdapter);
 */
import type { PhotoRecord, Label, IFeatureStore } from './types.js';

/**
 * Minimal DB adapter interface — implement for your SQLite library.
 */
export interface SQLiteDatabaseAdapter {
  /** Execute a statement (no return value) */
  exec(sql: string): void;
  /** Run a prepared statement with params, return rows as objects */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  /** Run an INSERT/UPDATE/DELETE, return changes count */
  run(sql: string, params?: unknown[]): { changes: number };
}

export class SQLiteFeatureStore implements IFeatureStore {
  private db: SQLiteDatabaseAdapter;

  constructor(db: SQLiteDatabaseAdapter) {
    this.db = db;
  }

  async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY,
        hash TEXT,
        embedding BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        label TEXT,
        ai_confidence REAL,
        updated_at INTEGER
      );
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_photos_label ON photos(label);
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_photos_created ON photos(created_at);
    `);
  }

  async save(record: PhotoRecord): Promise<void> {
    const embeddingBlob = this.embeddingToBlob(record.embedding);
    this.db.run(
      `INSERT OR REPLACE INTO photos (id, hash, embedding, created_at, label, ai_confidence, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.hash ?? null, embeddingBlob, record.createdAt, record.label ?? null, record.aiConfidence ?? null, Date.now()],
    );
  }

  async saveBatch(records: PhotoRecord[]): Promise<void> {
    for (const record of records) {
      await this.save(record);
    }
  }

  async getById(id: string): Promise<PhotoRecord | null> {
    const rows = this.db.query<PhotoRow>(
      'SELECT * FROM photos WHERE id = ?',
      [id],
    );
    if (rows.length === 0) return null;
    return this.rowToRecord(rows[0]);
  }

  async getUnclassified(): Promise<PhotoRecord[]> {
    const rows = this.db.query<PhotoRow>(
      'SELECT * FROM photos WHERE label IS NULL ORDER BY created_at',
    );
    return rows.map(r => this.rowToRecord(r));
  }

  async getAll(): Promise<PhotoRecord[]> {
    const rows = this.db.query<PhotoRow>(
      'SELECT * FROM photos ORDER BY created_at',
    );
    return rows.map(r => this.rowToRecord(r));
  }

  async updateLabel(id: string, label: Label, aiConfidence?: number): Promise<void> {
    const result = this.db.run(
      'UPDATE photos SET label = ?, ai_confidence = ?, updated_at = ? WHERE id = ?',
      [label, aiConfidence ?? null, Date.now(), id],
    );
    if (result.changes === 0) {
      throw new Error(`Record not found: ${id}`);
    }
  }

  async updateLabelsBatch(
    updates: Array<{ id: string; label: Label; aiConfidence?: number }>,
  ): Promise<void> {
    for (const update of updates) {
      await this.updateLabel(update.id, update.label, update.aiConfidence);
    }
  }

  async deleteByIds(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.db.run('DELETE FROM photos WHERE id = ?', [id]);
    }
  }

  async count(): Promise<number> {
    const rows = this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM photos');
    return rows[0]?.count ?? 0;
  }

  async countByLabel(): Promise<Record<string, number>> {
    const rows = this.db.query<{ label: string | null; count: number }>(
      'SELECT label, COUNT(*) as count FROM photos GROUP BY label',
    );
    const result: Record<string, number> = {};
    for (const row of rows) {
      const key = row.label ?? '__unclassified__';
      result[key] = row.count;
    }
    return result;
  }

  async close(): Promise<void> {
    // No-op — closing is the adapter's responsibility
  }

  // --- Serialization helpers ---

  private embeddingToBlob(embedding: number[]): Buffer {
    const buf = Buffer.allocUnsafe(embedding.length * 4);
    for (let i = 0; i < embedding.length; i++) {
      buf.writeFloatLE(embedding[i], i * 4);
    }
    return buf;
  }

  private blobToEmbedding(blob: Buffer): number[] {
    const embedding: number[] = [];
    for (let i = 0; i < blob.length; i += 4) {
      embedding.push(blob.readFloatLE(i));
    }
    return embedding;
  }

  private rowToRecord(row: PhotoRow): PhotoRecord {
    const embedding = Buffer.isBuffer(row.embedding)
      ? this.blobToEmbedding(row.embedding)
      : JSON.parse(row.embedding as unknown as string);

    return {
      id: row.id,
      hash: row.hash ?? undefined,
      embedding,
      createdAt: row.created_at,
      label: row.label ?? undefined,
      aiConfidence: row.ai_confidence ?? undefined,
    };
  }
}

interface PhotoRow {
  id: string;
  hash: string | null;
  embedding: Buffer;
  created_at: number;
  label: string | null;
  ai_confidence: number | null;
  updated_at: number;
}
