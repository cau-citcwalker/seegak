/**
 * LRU tile cache backed by ArrayBuffers.
 *
 * When the cache reaches maxSize entries the least-recently-used entry is
 * evicted.  All operations are O(1) thanks to a Map that preserves insertion
 * order — re-inserting on every `get` keeps the most-recently-used entry at
 * the end so the head is always the LRU candidate.
 */
export class TileCache {
  private readonly _maxSize: number;
  /** Map preserves insertion order; we re-insert on access to maintain LRU. */
  private readonly _store: Map<string, ArrayBuffer>;

  constructor(maxSize: number = 128) {
    if (maxSize < 1) throw new RangeError('TileCache maxSize must be >= 1');
    this._maxSize = maxSize;
    this._store = new Map();
  }

  /**
   * Return the cached ArrayBuffer for `key`, or `undefined` if not present.
   * Accessing an entry promotes it to most-recently-used.
   */
  get(key: string): ArrayBuffer | undefined {
    const value = this._store.get(key);
    if (value === undefined) return undefined;

    // Promote to MRU: delete and re-insert at end of Map iteration order.
    this._store.delete(key);
    this._store.set(key, value);
    return value;
  }

  /**
   * Store `data` under `key`.
   * If the key already exists its entry is updated and promoted to MRU.
   * If the cache is at capacity the LRU entry is evicted first.
   */
  set(key: string, data: ArrayBuffer): void {
    if (this._store.has(key)) {
      // Remove existing entry so re-insertion moves it to MRU position.
      this._store.delete(key);
    } else if (this._store.size >= this._maxSize) {
      // Evict the LRU entry (first key in Map iteration order).
      const lruKey = this._store.keys().next().value;
      if (lruKey !== undefined) {
        this._store.delete(lruKey);
      }
    }
    this._store.set(key, data);
  }

  /** Return `true` if `key` is present in the cache (does not update LRU). */
  has(key: string): boolean {
    return this._store.has(key);
  }

  /** Remove all entries from the cache. */
  clear(): void {
    this._store.clear();
  }

  /** Current number of entries in the cache. */
  get size(): number {
    return this._store.size;
  }
}
