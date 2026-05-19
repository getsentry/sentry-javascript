/*
 * Simplified types inlined from generic-pool.
 */

export declare class Pool<T> {
  acquire(priority?: number): PromiseLike<T>;
  [key: string]: any;
}
