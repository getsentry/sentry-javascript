import { getDefaultIsolationScope, getIsolationScope, logger, withIsolationScope } from '@sentry/core';
import type { EventHandler } from 'h3';
import { flushIfServerless } from '../util/flush';

/**
 * A helper to patch a given `h3` event handler, ensuring that
 * requests are properly isolated and data is flushed to Sentry.
 */
export function patchEventHandler(handler: EventHandler): EventHandler {
  return new Proxy(handler, {
    async apply(handlerTarget, handlerThisArg, handlerArgs: Parameters<EventHandler>) {
      // In environments where we cannot make use of the OTel
      // http instrumentation (e.g. when using top level import
      // of the server instrumentation file instead of
      // `--import` or dynamic import, like on vercel)
      // we still need to ensure requests are properly isolated
      // by comparing the current isolation scope to the default
      // one.
      // Requests are properly isolated if they differ.
      // If that's not the case, we fork the isolation scope here.
      const isolationScope = getIsolationScope();
      const newIsolationScope = isolationScope === getDefaultIsolationScope() ? isolationScope.clone() : isolationScope;

      logger.log(
        `Patched h3 event handler. ${
          isolationScope === newIsolationScope ? 'Using existing' : 'Created new'
        } isolation scope.`,
      );

      return withIsolationScope(newIsolationScope, async () => {
        try {
          return await handlerTarget.apply(handlerThisArg, handlerArgs);
        } finally {
          await flushIfServerless();
        }
      });
    },
  });
}
