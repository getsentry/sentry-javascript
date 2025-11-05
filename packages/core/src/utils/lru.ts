/** A simple Least Recently Used map */
export class LRUMap<K, V> {
  private readonly _cache: Map<K, V>;

  public constructor(private readonly _maxSize: number) {
    this._cache = new Map<K, V>();
  }

  /** Get the current size of the cache */
  public get size(): number {
    return this._cache.size;
  }

  /** Get an entry or undefined if it was not in the cache. Re-inserts to update the recently used order */
  public get(key: K): V | undefined {
    const value = this._cache.get(key);
    if (value === undefined) {
      return undefined;
    }
    // Remove and re-insert to update the order
    this._cache.delete(key);
    this._cache.set(key, value);
    return value;
  }

  /** Insert an entry and evict an older entry if we've reached maxSize */
  public set(key: K, value: V): void {
    if (this._cache.size >= this._maxSize) {
      // keys() returns an iterator in insertion order so keys().next() gives us the oldest key
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const nextKey = this._cache.keys().next().value!;
      this._cache.delete(nextKey);
    }
    this._cache.set(key, value);
  }

  /** Remove an entry and return the entry if it was in the cache */
  public remove(key: K): V | undefined {
    const value = this._cache.get(key);
    if (value) {
      this._cache.delete(key);
    }
    return value;
  }

  /** Clear all entries */
  public clear(): void {
    this._cache.clear();
  }

  /** Get all the keys */
  public keys(): Array<K> {
    return Array.from(this._cache.keys());
  }

  /** Get all the values */
  public values(): Array<V> {
    const values: V[] = [];
    this._cache.forEach(value => values.push(value));
    return values;
  }
}
