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
  let resolveAllDone: () => void = () => undefined;
  const allDone = new Promise<void>(res => {
    resolveAllDone = res;
  });
  let pending = 0;
  const originalWaitUntil = context.waitUntil.bind(context) as typeof context.waitUntil;
  context.waitUntil = promise => {
    pending++;
    return originalWaitUntil(
      promise.finally(() => {
        if (--pending === 0) resolveAllDone();
      }),
    );
  };
  return Object.freeze({
    ready: allDone,
    finalize: () => {
      if (pending === 0) resolveAllDone();
      return allDone;
    },
  });
}
