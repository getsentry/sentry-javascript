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
      // Bound once so calls neither look up a page-replaceable `apply` nor copy arguments, which native toString ignores
      const callOriginalFunctionToString = Function.prototype.call.bind(originalFunctionToString) as (
        thisArg: unknown,
      ) => string;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const hasOwnProperty = Function.prototype.call.bind(Object.prototype.hasOwnProperty) as (
        obj: unknown,
        key: PropertyKey,
      ) => boolean;

      // intrinsics (like Function.prototype) might be immutable in some environments
      // e.g. Node with --frozen-intrinsics, XS (an embedded JavaScript engine) or SES (a JavaScript proposal)
      try {
        Function.prototype.toString = function (this: WrappedFunction): string {
          let unwrappedFunction: WrappedFunction | undefined;

          try {
            // `markFunctionWrapped` sets the original as an own property. An inherited lookup could walk a
            // prototype chain that loops through a Proxy and overflow the stack, which native `toString` never does.
            if (SETUP_CLIENTS.has(getClient() as Client) && hasOwnProperty(this, '__sentry_original__')) {
              unwrappedFunction = getOriginalFunction(this);
            }
          } catch {
            // Reading the Sentry carrier off `getClient()` can throw a `SecurityError` when `this` (or the global
            // object) is a `WindowProxy` whose browsing context was navigated cross-origin, and Proxy traps on
            // `this` can throw too. The native `toString` never throws here, so fall back to it to avoid turning
            // harmless introspection into noise.
          }

          return callOriginalFunctionToString(unwrappedFunction ?? this);
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
