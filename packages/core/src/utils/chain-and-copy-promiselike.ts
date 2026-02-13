/**
 * Copy the properties from a decorated promiselike object onto its chained
 * actual promise.
 */
export const chainAndCopyPromiseLike = <V, T extends PromiseLike<V> & Record<string, unknown>>(
  original: T,
  onSuccess: (value: V) => void,
  onError: (e: unknown) => void,
): T => {
  return copyProps(
    original,
    original.then(
      value => {
        onSuccess(value);
        return value;
      },
      err => {
        onError(err);
        throw err;
      },
    ),
  ) as T;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const copyProps = <T extends Record<string, any>>(original: T, chained: T): T => {
  for (const key in original) {
    if (key in chained) continue;
    const value = original[key];
    if (typeof value === 'function') {
      Object.defineProperty(chained, key, {
        value: (...args: unknown[]) => value.apply(original, args),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      (chained as Record<string, unknown>)[key] = value;
    }
  }

  return chained;
};
