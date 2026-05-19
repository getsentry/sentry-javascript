/*
 * Simplified types inlined from generic-pool.
 * Only includes members accessed by this instrumentation.
 */

export declare class Pool<T> {
  acquire(priority?: number): PromiseLike<T>;
  [key: string]: any;
}
