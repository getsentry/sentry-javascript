import { isThenable } from '../utils/is';

/* eslint-disable */
// Vendor "Awaited" in to be TS 3.8 compatible
type AwaitedPromise<T> = T extends null | undefined
  ? T // special case for `null | undefined` when not in `--strictNullChecks` mode
  : T extends object & { then(onfulfilled: infer F, ...args: infer _): any } // `await` only unwraps object types with a callable `then`. Non-object types are not unwrapped
    ? F extends (value: infer V, ...args: infer _) => any // if the argument to `then` is callable, extracts the first argument
      ? V // normally this would recursively unwrap, but this is not possible in TS3.8
      : never // the argument to `then` was not callable
    : T; // non-object or non-thenable
/* eslint-enable */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleCallbackErrors<Fn extends () => Promise<any>, PromiseValue = AwaitedPromise<ReturnType<Fn>>>(
  fn: Fn,
  onError: (error: unknown) => void,
  onFinally?: () => void,
  onSuccess?: (result: PromiseValue) => void,
): ReturnType<Fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleCallbackErrors<Fn extends () => any>(
  fn: Fn,
  onError: (error: unknown) => void,
  onFinally?: () => void,
  onSuccess?: (result: ReturnType<Fn>) => void,
): ReturnType<Fn>;
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
  ValueType = ReturnType<Fn>,
>(
  fn: Fn,
  onError: (error: unknown) => void,
  onFinally: () => void = () => {},
  onSuccess: (result: ValueType | AwaitedPromise<ValueType>) => void = () => {},
): ValueType {
  let maybePromiseResult: ReturnType<Fn>;
  try {
    maybePromiseResult = fn();
  } catch (e) {
    onError(e);
    onFinally();
    throw e;
  }

  return maybeHandlePromiseRejection(maybePromiseResult, onError, onFinally, onSuccess);
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
  onSuccess: (result: MaybePromise | AwaitedPromise<MaybePromise>) => void,
): MaybePromise {
  if (isThenable(value)) {
    // @ts-expect-error - the isThenable check returns the "wrong" type here
    return value.then(
      res => {
        onFinally();
        onSuccess(res);
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
  onSuccess(value);
  return value;
}
