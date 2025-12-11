import type { ExecutionContext } from '@cloudflare/workers-types';
import { startSpan, withScope } from '@sentry/core';

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
      // Wrap the promise in a new scope and transaction so spans created inside
      // waitUntil callbacks are properly isolated from the HTTP request transaction
      withScope(() =>
        startSpan({ forceTransaction: true, op: 'cloudflare.wait_until', name: 'waitUntil' }, async () => {
          // By awaiting the promise inside the new scope, all of its continuations
          // will execute in this isolated scope
          await promise;
        }),
      ).finally(() => {
        if (--pending === 0) {
          resolveAllDone();
        }
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
