/**
 * Expo SQLite adapter for SQLiteFeatureStore.
 *
 * Bridges the generic SQLiteDatabaseAdapter interface with expo-sqlite,
 * the standard SQLite library for Expo / React Native.
 *
 * Dependencies (install in the app package):
 *   expo install expo-sqlite
 *
 * Usage:
 *   const db = await openDatabaseAsync('smart-photo.db');
 *   const adapter = createExpoSQLiteAdapter(db);
 *   const store = new SQLiteFeatureStore(adapter);
 */
import type { SQLiteDatabaseAdapter } from '../sqlite-store.js';

/**
 * Minimal interface matching expo-sqlite v13+ database shape.
 * Avoids hard dependency on expo-sqlite types.
 */
export interface ExpoSQLiteDB {
  exec(sql: string): Promise<void>;
  execSync?(sql: string): void;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  runSync?(sql: string, params?: unknown[]): { changes: number; lastInsertRowId: number };
  getAllSync?<T>(sql: string, params?: unknown[]): T[];
  getAll?<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

/**
 * Create a SQLiteDatabaseAdapter from an expo-sqlite database instance.
 */
export function createExpoSQLiteAdapter(db: ExpoSQLiteDB): SQLiteDatabaseAdapter {
  return {
    exec(sql: string): void {
      if (typeof db.execSync === 'function') {
        db.execSync(sql);
      } else if (typeof db.runSync === 'function') {
        db.runSync(sql);
      } else {
        // Async fallback — fire and forget for sync interface
        db.exec(sql).catch(err => console.error('[expo-sqlite] exec error:', err));
      }
    },

    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
      if (typeof db.getAllSync === 'function') {
        return db.getAllSync<T>(sql, params ?? []);
      }
      console.warn('[expo-sqlite] Synchronous query not available, returning empty array');
      return [];
    },

    run(sql: string, params?: unknown[]): { changes: number } {
      if (typeof db.runSync === 'function') {
        const result = db.runSync(sql, params ?? []);
        return { changes: result.changes ?? 0 };
      }
      // Async fallback
      db.run(sql, params ?? []).catch(err => console.error('[expo-sqlite] run error:', err));
      return { changes: 0 };
    },
  };
}
