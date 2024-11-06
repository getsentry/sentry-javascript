// Key names match the type used by Sentry frontend.
export type FeatureFlag = { flag: string; result: boolean };

/**
 * Ordered LRU cache for storing feature flags in the scope context. The name
 * of each flag in the buffer is unique, and the output of getAll() is ordered
 * from oldest to newest.
 */
export interface FlagBufferInterface {
  readonly maxSize: number;

  /**
   * Returns a deep copy of the current FlagBuffer.
   */
  clone(): FlagBufferInterface;

  /**
   * Returns an ordered array of the flags currently stored in the buffer.
   * This is in the order of insertion (oldest to newest).
   */
  getAll(): readonly FeatureFlag[];

  /**
   * Add a flag to the buffer. After inserting, the flag is guaranteed to be at
   * the end of the buffer, with no other flags of the same name in it.
   *
   * @param flag
   */
  insert(name: string, value: boolean): void;

  /**
   * Clear the buffer. Returns the number of flags removed.
   */
  clear(): number;
}
