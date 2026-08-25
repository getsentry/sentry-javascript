import type { Client } from '../client';
import { getClient } from '../currentScopes';
import { defineIntegration } from '../integration';
import type { IntegrationFn } from '../types/integration';
import type { WrappedFunction } from '../types/wrappedfunction';
import { getOriginalFunction } from '../utils/object';

const INTEGRATION_NAME = 'FunctionToString' as const;

const SETUP_CLIENTS = new WeakMap<Client, boolean>();

const _functionToStringIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalFunctionToString = Function.prototype.toString;

      // intrinsics (like Function.prototype) might be immutable in some environments
      // e.g. Node with --frozen-intrinsics, XS (an embedded JavaScript engine) or SES (a JavaScript proposal)
      try {
        Function.prototype.toString = function (this: WrappedFunction, ...args: unknown[]): string {
          const originalFunction = getOriginalFunction(this);
          let unwrappedFunction: WrappedFunction | undefined;

          try {
            if (SETUP_CLIENTS.has(getClient() as Client) && originalFunction !== undefined) {
              unwrappedFunction = originalFunction;
            }
          } catch {
            // Reading the Sentry carrier off `getClient()` can throw a `SecurityError` when `this` (or the global
            // object) is a `WindowProxy` whose browsing context was navigated cross-origin. The native
            // `toString` never throws here, so fall back to it to avoid turning harmless introspection into noise.
          }

          return originalFunctionToString.apply(unwrappedFunction ?? this, args);
        };
      } catch {
        // ignore errors here, just don't patch this
      }
    },
    setup(client) {
      SETUP_CLIENTS.set(client, true);
    },
  };
}) satisfies IntegrationFn;

/**
 * Patch toString calls to return proper name for wrapped functions.
 *
 * ```js
 * Sentry.init({
 *   integrations: [
 *     functionToStringIntegration(),
 *   ],
 * });
 * ```
 */
export const functionToStringIntegration = defineIntegration(_functionToStringIntegration);
