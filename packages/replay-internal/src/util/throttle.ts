export const THROTTLED = '__THROTTLED';
export const SKIPPED = '__SKIPPED';

/**
 * Create a throttled function off a given function.
 * When calling the throttled function, it will call the original function only
 * if it hasn't been called more than `maxCount` times in the last `durationSeconds`.
 *
 * Returns `THROTTLED` if throttled for the first time, after that `SKIPPED`,
 * or else the return value of the original function.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttle<T extends (...rest: any[]) => any>(
  fn: T,
  maxCount: number,
  durationSeconds: number,
): (...rest: Parameters<T>) => ReturnType<T> | typeof THROTTLED | typeof SKIPPED {
  const counter = new Map<number, number>();

  const _cleanup = (now: number): void => {
    const threshold = now - durationSeconds;
    counter.forEach((_value, key) => {
      if (key < threshold) {
        counter.delete(key);
      }
    });
  };

  const _getTotalCount = (): number => {
    return [...counter.values()].reduce((a, b) => a + b, 0);
  };

  let isThrottled = false;

  return (...rest: Parameters<T>): ReturnType<T> | typeof THROTTLED | typeof SKIPPED => {
    // Date in second-precision, which we use as basis for the throttling
    const now = Math.floor(Date.now() / 1000);

    // First, make sure to delete any old entries
    _cleanup(now);

    // If already over limit, do nothing
    if (_getTotalCount() >= maxCount) {
      const wasThrottled = isThrottled;
      isThrottled = true;
      return wasThrottled ? SKIPPED : THROTTLED;
    }

    isThrottled = false;
    const count = counter.get(now) || 0;
    counter.set(now, count + 1);

    return fn(...rest);
  };
}
