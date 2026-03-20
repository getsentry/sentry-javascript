import {
  debug,
  flushIfServerless,
  getDefaultIsolationScope,
  getIsolationScope,
  withIsolationScope,
} from '@sentry/core';

/**
 * Patches the H3 event handler of Nitro.
 *
 * Uses a TypeScript generic type to ensure the returned handler type fits different versions of Nitro.
 */
export function patchEventHandler<H3EventHandler extends Function>(handler: H3EventHandler): H3EventHandler {
  return new Proxy(handler, {
    async apply(handlerTarget, handlerThisArg, handlerArgs: unknown) {
      const isolationScope = getIsolationScope();
      const newIsolationScope = isolationScope === getDefaultIsolationScope() ? isolationScope.clone() : isolationScope;

      debug.log(
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
