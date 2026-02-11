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
 *
 * For thenable objects with extra methods (like jQuery's jqXHR),
 * this function preserves those methods by wrapping the original thenable in a Proxy
 * that intercepts .then() calls to apply error handling while forwarding all other
 * properties to the original object.
 * This allows code like `startSpan(() => $.ajax(...)).abort()` to work correctly.
 */
function maybeHandlePromiseRejection<MaybePromise>(
  value: MaybePromise,
  onError: (error: unknown) => void,
  onFinally: () => void,
  onSuccess: (result: MaybePromise | AwaitedPromise<MaybePromise>) => void,
): MaybePromise {
  if (isThenable(value)) {
    // Track whether we've already attached handlers to avoid calling callbacks multiple times
    let handlersAttached = false;

    // 1. Wrap the original thenable in a Proxy to preserve all its methods
    return new Proxy(value, {
      get(target, prop, receiver) {
        // Special handling for .then() - intercept it to add error handling
        if (prop === 'then' && typeof target.then === 'function') {
          return function (
            onfulfilled?: ((value: unknown) => unknown) | null,
            onrejected?: ((reason: unknown) => unknown) | null,
          ) {
            // Only attach handlers once to avoid calling callbacks multiple times
            if (!handlersAttached) {
              handlersAttached = true;

              // Wrap the fulfillment handler to call our callbacks
              const wrappedOnFulfilled = onfulfilled
                ? (res: unknown) => {
                    onFinally();
                    onSuccess(res as MaybePromise);
                    return onfulfilled(res);
                  }
                : (res: unknown) => {
                    onFinally();
                    onSuccess(res as MaybePromise);
                    return res;
                  };

              // Wrap the rejection handler to call our callbacks
              const wrappedOnRejected = onrejected
                ? (err: unknown) => {
                    onError(err);
                    onFinally();
                    return onrejected(err);
                  }
                : (err: unknown) => {
                    onError(err);
                    onFinally();
                    throw err;
                  };

              // Call the original .then() with our wrapped handlers
              const thenResult = target.then.call(target, wrappedOnFulfilled, wrappedOnRejected);

              // 2. Some thenable implementations (like jQuery) return a new object from .then()
              // that doesn't include custom properties from the original (like .abort()).
              // We wrap the result in another Proxy to preserve access to those properties.
              return new Proxy(thenResult, {
                get(thenTarget, thenProp) {
                  // First try to get the property from the .then() result
                  const thenValue = Reflect.get(thenTarget, thenProp, thenTarget);
                  if (thenValue !== undefined) {
                    return typeof thenValue === 'function' ? thenValue.bind(thenTarget) : thenValue;
                  }

                  // Fall back to the original object for properties like .abort()
                  const originalValue = Reflect.get(target, thenProp, target);
                  if (originalValue !== undefined) {
                    return typeof originalValue === 'function' ? originalValue.bind(target) : originalValue;
                  }

                  return undefined;
                },
                has(thenTarget, thenProp) {
                  // Check if property exists in either the .then() result or the original object
                  return thenProp in thenTarget || thenProp in (target as object);
                },
              });
            } else {
              // Subsequent .then() calls pass through without additional wrapping
              return target.then.call(target, onfulfilled, onrejected);
            }
          };
        }

        // For all other properties, forward to the original object
        const originalValue = Reflect.get(target, prop, target);
        if (originalValue !== undefined) {
          // Bind methods to preserve 'this' context
          return typeof originalValue === 'function' ? originalValue.bind(target) : originalValue;
        }

        return undefined;
      },
      has(target, prop) {
        // Check if property exists in the original object
        return prop in (target as object);
      },
    });
  }

  // Non-thenable value - call callbacks immediately and return as-is
  onFinally();
  onSuccess(value);
  return value;
}
