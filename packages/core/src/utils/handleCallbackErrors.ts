import { isThenable } from '../utils-hoist/is';

/**
 * Wrap a callback function with error handling.
 * If an error is thrown, it will be passed to the `onError` callback and re-thrown.
 *
 * If the return value of the function is a promise, it will be handled with `maybeHandlePromiseRejection`.
 *
 * If an `onFinally` callback is provided, this will be called when the callback has finished
 * - so if it returns a promise, once the promise resolved/rejected,
 * else once the callback has finished executing.
 * The `onFinally` callback will _always_ be called, no matter if an error was thrown or not.
 */
export function handleCallbackErrors<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Fn extends () => any,
>(
  fn: Fn,
  onError: (error: unknown) => void,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onFinally: () => void = () => {},
): ReturnType<Fn> {
  let maybePromiseResult: ReturnType<Fn>;
  try {
    maybePromiseResult = fn();
  } catch (e) {
    onError(e);
    onFinally();
    throw e;
  }

  return maybeHandlePromiseRejection(maybePromiseResult, onError, onFinally);
}

/**
 * Maybe handle a promise rejection.
 * This expects to be given a value that _may_ be a promise, or any other value.
 * If it is a promise, and it rejects, it will call the `onError` callback.
 * Other than this, it will generally return the given value as-is.
 */
function maybeHandlePromiseRejection<MaybePromise>(
  value: MaybePromise,
  onError: (error: unknown) => void,
  onFinally: () => void,
): MaybePromise {
  if (isThenable(value)) {
    // @ts-expect-error - the isThenable check returns the "wrong" type here
    return value.then(
      res => {
        onFinally();
        return res;
      },
      e => {
        onError(e);
        onFinally();
        throw e;
      },
    );
  }

  onFinally();
  return value;
}
