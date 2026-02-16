import type { ExecutionContext } from '@cloudflare/workers-types';

type FlushLock = {
  readonly ready: Promise<void>;
  readonly finalize: () => Promise<void>;
};

/**
 * Enhances the given execution context by wrapping its `waitUntil` method with a proxy
 * to monitor pending tasks, and provides a flusher function to ensure all tasks
 * have been completed before executing any subsequent logic.
 *
 * @param {ExecutionContext} context - The execution context to be enhanced. If no context is provided, the function returns undefined.
 * @return {FlushLock} Returns a flusher function if a valid context is provided, otherwise undefined.
 */
export function makeFlushLock(context: ExecutionContext): FlushLock {
  // Get the original uninstrumented context if available (from instrumentContext wrapper)
  // This avoids accessing the proxied waitUntil which creates a bound function
  // that retains the context and prevents GC
  const originalContext =
    (context as { _originalContext?: ExecutionContext })._originalContext ?? context;

  let resolveAllDone: (() => void) | undefined;
  const allDone = new Promise<void>(res => {
    resolveAllDone = res;
  });
  let pending = 0;
  let isFinalized = false;

  // Store original waitUntil function reference - use .call() instead of .bind()
  // to avoid creating a bound function that keeps context permanently alive
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalWaitUntil = originalContext.waitUntil;

  // Wrap waitUntil to track pending promises
  context.waitUntil = (promise: Promise<unknown>): void => {
    // After finalization, just pass through to original
    if (isFinalized) {
      originalWaitUntil.call(originalContext, promise);
      return;
    }
    pending++;
    // Use .call() for invocation - this doesn't create a permanent binding
    originalWaitUntil.call(originalContext,
      promise.finally(() => {
        if (--pending === 0 && resolveAllDone) {
          resolveAllDone();
          resolveAllDone = undefined; // Clear reference to allow GC
        }
      }),
    );
  };

  return Object.freeze({
    ready: allDone,
    finalize: () => {
      if (!isFinalized) {
        isFinalized = true;
        if (pending === 0 && resolveAllDone) {
          resolveAllDone();
          resolveAllDone = undefined; // Clear reference to allow GC
        }
      }
      return allDone;
    },
  });
}
