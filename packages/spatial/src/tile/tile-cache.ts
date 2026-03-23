export interface TileData {
  data: ArrayBuffer;
  width: number;
  height: number;
  dtype: string;
}

/**
 * Simple LRU cache for decoded tile data.
 * Evicts the least recently used entry when capacity is exceeded.
 */
export class TileCache {
  /** Insertion-order map used as LRU (delete+re-insert on access) */
  private cache = new Map<string, TileData>();

  constructor(private maxSize = 128) {}

  get(key: string): TileData | undefined {
    const entry = this.cache.get(key);
    if (entry === undefined) return undefined;
    // Move to most-recently-used position
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  set(key: string, value: TileData): void {
    if (this.cache.has(key)) {
      // Refresh position
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict LRU (first entry in insertion order)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
