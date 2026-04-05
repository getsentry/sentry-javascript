const isActualPromise = (p: unknown) =>
  p instanceof Promise && !(p as unknown as ChainedPromiseLike<unknown>)[kChainedCopy];

type ChainedPromiseLike<T> = PromiseLike<T> & {
  [kChainedCopy]: true;
};
const kChainedCopy = Symbol('chained PromiseLike');

/**
 * Copy the properties from a decorated promiselike object onto its chained
 * actual promise.
 */
export const chainAndCopyPromiseLike = <V, T extends PromiseLike<V>>(
  original: T,
  onSuccess: (value: V) => void,
  onError: (e: unknown) => void,
): T => {
  const chained = original.then(
    value => {
      onSuccess(value);
      return value;
    },
    err => {
      onError(err);
      throw err;
    },
  ) as T;

  // if we're just dealing with "normal" Promise objects, return the chain
  return isActualPromise(chained) && isActualPromise(original) ? chained : copyProps(original, chained);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const copyProps = <T extends Record<string, any>>(original: T, chained: T): T => {
  let mutated = false;
  //oxlint-disable-next-line guard-for-in
  for (const key in original) {
    if (key in chained) continue;
    mutated = true;
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

  if (mutated) Object.assign(chained, { [kChainedCopy]: true });
  return chained;
};
