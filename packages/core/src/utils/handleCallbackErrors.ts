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
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const hasAbort = typeof value.abort === 'function';
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const hasStatus = 'status' in value;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const hasReadyState = 'readyState' in value;
    console.log('[ORIGINAL] valuehasAbort:', hasAbort, 'hasStatus:', hasStatus, 'hasReadyState:', hasReadyState);

    // Track whether we've already attached handlers to avoid calling callbacks multiple times
    let handlersAttached = false;

    // Wrap the original value directly to preserve all its methods
    return new Proxy(value, {
      get(target, prop, receiver) {
        console.log(`[PROXY GET] Accessing property: "${String(prop)}"`);

        // Special handling for .then() - intercept it to add error handling
        if (prop === 'then' && typeof target.then === 'function') {
          console.log('[PROXY] Intercepting .then() call');
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

              // CRITICAL: jQuery's .then() returns a new Deferred object without .abort()
              // We need to wrap this result in a Proxy that falls back to the original object
              return new Proxy(thenResult, {
                get(thenTarget, thenProp) {
                  console.log(`[THEN-PROXY GET] Accessing property: "${String(thenProp)}"`);
                  // First try the result of .then()
                  const thenValue = Reflect.get(thenTarget, thenProp, thenTarget);
                  if (thenValue !== undefined) {
                    console.log(`[THEN-PROXY] Getting "${String(thenProp)}" from then result:`, typeof thenValue);
                    return typeof thenValue === 'function' ? thenValue.bind(thenTarget) : thenValue;
                  }

                  // Fall back to the ORIGINAL object for properties like .abort()
                  const originalValue = Reflect.get(target, thenProp, target);
                  if (originalValue !== undefined) {
                    console.log(
                      `[THEN-PROXY] Getting "${String(thenProp)}" from ORIGINAL object:`,
                      typeof originalValue,
                    );
                    return typeof originalValue === 'function' ? originalValue.bind(target) : originalValue;
                  }

                  return undefined;
                },
              });
            } else {
              // Subsequent .then() calls just pass through without wrapping
              return target.then.call(target, onfulfilled, onrejected);
            }
          };
        }

        // For all other properties, forward to the original object
        const originalValue = Reflect.get(target, prop, target);
        console.log(`[PROXY] Getting property "${String(prop)}" from original:`, typeof originalValue);

        if (originalValue !== undefined) {
          // Bind methods to preserve 'this' context
          return typeof originalValue === 'function' ? originalValue.bind(target) : originalValue;
        }

        return undefined;
      },
    });
  }

  onFinally();
  onSuccess(value);

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const hasAbort = typeof value.abort === 'function';
  console.log('[NON-THENABLE] valuehasAbort:', hasAbort);
  return value;
}
