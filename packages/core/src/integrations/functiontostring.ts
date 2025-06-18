import type { Client } from '../client';
import { getClient } from '../currentScopes';
import { defineIntegration } from '../integration';
import type { IntegrationFn } from '../types-hoist/integration';
import type { WrappedFunction } from '../types-hoist/wrappedfunction';
import { getOriginalFunction } from '../utils/object';

let originalFunctionToString: () => void;

const INTEGRATION_NAME = 'FunctionToString';

const SETUP_CLIENTS = new WeakMap<Client, boolean>();

const _functionToStringIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      originalFunctionToString = Function.prototype.toString;

      // intrinsics (like Function.prototype) might be immutable in some environments
      // e.g. Node with --frozen-intrinsics, XS (an embedded JavaScript engine) or SES (a JavaScript proposal)
      try {
        Function.prototype.toString = function (this: WrappedFunction, ...args: unknown[]): string {
          const originalFunction = getOriginalFunction(this);
          const context =
            SETUP_CLIENTS.has(getClient() as Client) && originalFunction !== undefined ? originalFunction : this;
          return originalFunctionToString.apply(context, args);
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
