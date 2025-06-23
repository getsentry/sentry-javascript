import type { ExecutionContext } from '@cloudflare/workers-types';
import { flush } from '@sentry/core';

type Flusher = (...params: Parameters<typeof flush>) => void;

/**
 * Enhances the given execution context by wrapping its `waitUntil` method with a proxy
 * to monitor pending tasks, and provides a flusher function to ensure all tasks
 * have been completed before executing any subsequent logic.
 *
 * @param {ExecutionContext | void} context - The execution context to be enhanced. If no context is provided, the function returns undefined.
 * @return {Flusher | void} Returns a flusher function if a valid context is provided, otherwise undefined.
 */
export function makeFlushAfterAll(context: ExecutionContext): Flusher {
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
  return (...params: Parameters<typeof flush>) => {
    if (pending === 0) {
      return originalWaitUntil(flush(...params));
    }
    originalWaitUntil(allDone.finally(() => flush(...params)));
  };
}
