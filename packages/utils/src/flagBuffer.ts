import type { FeatureFlag } from '@sentry/types';
import type { FlagBufferInterface } from '@sentry/types/build/types/flags';

export const DEFAULT_FLAG_BUFFER_SIZE = 100;

/**
 * Array implementation of types/FlagBufferInterface.
 *
 * Ordered LRU cache for storing feature flags in the scope context. The name
 * of each flag in the buffer is unique, and the output of getAll() is ordered
 * from oldest to newest.
 */
export class FlagBuffer implements FlagBufferInterface {
  public readonly maxSize: number;

  private readonly _flags: FeatureFlag[];

  public constructor(_maxSize: number = DEFAULT_FLAG_BUFFER_SIZE, _initialFlags: FeatureFlag[] = []) {
    this.maxSize = _maxSize;
    if (_initialFlags.length > _maxSize) {
      throw Error(`_initialFlags param exceeds the maxSize of ${_maxSize}`);
    }
    this._flags = _initialFlags;
  }

  /**
   * @inheritdoc
   */
  public clone(): FlagBuffer {
    return new FlagBuffer(this.maxSize, this._flags);
  }

  /**
   * @inheritdoc
   */
  public getAll(): readonly FeatureFlag[] {
    return [...this._flags]; // shallow copy
  }

  /**
   * @inheritdoc
   */
  public insert(name: string, value: boolean): void {
    // Check if the flag is already in the buffer
    const index = this._flags.findIndex(f => f.flag === name);

    if (index !== -1) {
      // The flag was found, remove it from its current position - O(n)
      this._flags.splice(index, 1);
    }

    if (this._flags.length === this.maxSize) {
      // If at capacity, pop the earliest flag - O(n)
      this._flags.shift();
    }

    // Push the flag to the end - O(1)
    this._flags.push({
      flag: name,
      result: value,
    });
  }

  /**
   * @inheritdoc
   */
  public clear(): number {
    const length = this._flags.length;
    this._flags.splice(0, length); // O(n)
    return length;
  }
}
