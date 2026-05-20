/**
 * In-memory FeatureStore implementation.
 * Suitable for development/testing and small datasets.
 * For production mobile use, implement IFeatureStore with WatermelonDB/SQLite.
 */
import type { PhotoRecord, Label, IFeatureStore } from './types.js';

export class InMemoryFeatureStore implements IFeatureStore {
  private records = new Map<string, PhotoRecord>();

  async init(): Promise<void> {
    // No-op for in-memory
  }

  async save(record: PhotoRecord): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  async saveBatch(records: PhotoRecord[]): Promise<void> {
    for (const record of records) {
      this.records.set(record.id, { ...record });
    }
  }

  async getById(id: string): Promise<PhotoRecord | null> {
    const record = this.records.get(id);
    return record ? { ...record } : null;
  }

  async getUnclassified(): Promise<PhotoRecord[]> {
    const result: PhotoRecord[] = [];
    for (const record of this.records.values()) {
      if (!record.label) {
        result.push({ ...record });
      }
    }
    return result;
  }

  async getAll(): Promise<PhotoRecord[]> {
    return Array.from(this.records.values()).map(r => ({ ...r }));
  }

  async updateLabel(id: string, label: Label, aiConfidence?: number): Promise<void> {
    const record = this.records.get(id);
    if (!record) {
      throw new Error(`Record not found: ${id}`);
    }
    record.label = label;
    if (aiConfidence !== undefined) {
      record.aiConfidence = aiConfidence;
    }
  }

  async updateLabelsBatch(
    updates: Array<{ id: string; label: Label; aiConfidence?: number }>,
  ): Promise<void> {
    for (const update of updates) {
      const record = this.records.get(update.id);
      if (!record) {
        throw new Error(`Record not found: ${update.id}`);
      }
      record.label = update.label;
      if (update.aiConfidence !== undefined) {
        record.aiConfidence = update.aiConfidence;
      }
    }
  }

  async deleteByIds(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.records.delete(id);
    }
  }

  async count(): Promise<number> {
    return this.records.size;
  }

  async close(): Promise<void> {
    this.records.clear();
  }
}
