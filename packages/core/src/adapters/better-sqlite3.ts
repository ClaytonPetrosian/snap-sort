/**
 * better-sqlite3 adapter for SQLiteFeatureStore.
 * Works in Node.js and Tauri (via Node.js sidecar).
 *
 * Usage:
 *   import Database from 'better-sqlite3';
 *   import { createBetterSqlite3Adapter } from '@smart-photo/core/adapters/better-sqlite3';
 *
 *   const db = new Database('photos.db');
 *   const adapter = createBetterSqlite3Adapter(db);
 *   const store = new SQLiteFeatureStore(adapter);
 */
import type { SQLiteDatabaseAdapter } from '../sqlite-store.js';

/**
 * Create a SQLiteDatabaseAdapter from a better-sqlite3 Database instance.
 */
export function createBetterSqlite3Adapter(db: any): SQLiteDatabaseAdapter {
  return {
    exec(sql: string): void {
      db.exec(sql);
    },

    query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
      const stmt = db.prepare(sql);
      return stmt.all(...params) as T[];
    },

    run(sql: string, params: unknown[] = []): { changes: number } {
      const stmt = db.prepare(sql);
      const result = stmt.run(...params);
      return { changes: result.changes };
    },
  };
}
