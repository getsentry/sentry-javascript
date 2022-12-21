type DebouncedCallback = {
  flush: () => void | unknown;
  cancel: () => void;
  (): void | unknown;
};
type CallbackFunction = () => unknown;
type DebounceOptions = { maxWait?: number };

/**
 * Heavily simplified debounce function based on lodash.debounce.
 *
 * This function takes a callback function (@param fun) and delays its invocation
 * by @param wait milliseconds. Optionally, a maxWait can be specified in @param options,
 * which ensures that the callback is invoked at least once after the specified max. wait time.
 *
 * @param func the function whose invocation is to be debounced
 * @param wait the minimum time until the function is invoked after it was called once
 * @param options the options object, which can contain the `maxWait` property
 *
 * @returns the debounced version of the function, which needs to be called at least once to start the
 *          debouncing process. Subsequent calls will reset the debouncing timer and, in case @paramfunc
 *          was already invoked in the meantime, return @param func's return value.
 *          The debounced function has two additional properties:
 *          - `flush`: Invokes the debounced function immediately and returns its return value
 *          - `cancel`: Cancels the debouncing process and resets the debouncing timer
 */
export function debounce(func: CallbackFunction, wait: number, options?: DebounceOptions): DebouncedCallback {
  let callbackReturnValue: unknown;
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let lastCallTime: number | undefined;
  let lastInvokeTime = 0;

  const maxWait = options && options.maxWait ? Math.max(options.maxWait || 0, wait) : 0;

  function invokeFunc(time: number): unknown {
    timerId = undefined;

    // Only invoke if we have `lastCallTime` which means `func` has been
    // debounced at least once.
    if (lastCallTime !== undefined) {
      lastInvokeTime = time;
      callbackReturnValue = func();
    }

    return callbackReturnValue;
  }

  function calcRemainingWait(time: number): number {
    const timeSinceLastCall = time - (lastCallTime || 0);
    const timeSinceLastInvoke = time - lastInvokeTime;
    const remainingWait = wait - timeSinceLastCall;

    return maxWait ? Math.min(remainingWait, maxWait - timeSinceLastInvoke) : remainingWait;
  }

  function shouldInvoke(time: number): boolean {
    const timeSinceLastCall = time - (lastCallTime || 0);
    const timeSinceLastInvoke = time - lastInvokeTime;

    return timeSinceLastCall >= wait || (Boolean(maxWait) && timeSinceLastInvoke >= maxWait);
  }

  function timerExpired(): void {
    const time = Date.now();
    if (shouldInvoke(time)) {
      return void invokeFunc(time);
    }

    // Restart the timer.
    timerId = setTimeout(timerExpired, calcRemainingWait(time));
  }

  function cancel(): void {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
    lastInvokeTime = 0;
    lastCallTime = timerId = undefined;
  }

  function flush(): unknown {
    return timerId === undefined ? callbackReturnValue : invokeFunc(Date.now());
  }

  function debounced(): unknown {
    lastCallTime = Date.now();
    if (timerId === undefined) {
      lastInvokeTime = lastCallTime;
      timerId = setTimeout(timerExpired, wait);
    }
    return callbackReturnValue;
  }

  debounced.cancel = cancel;
  debounced.flush = flush;
  return debounced;
}
