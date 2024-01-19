import type { Integration, IntegrationClass, IntegrationFn, WrappedFunction } from '@sentry/types';
import { getOriginalFunction } from '@sentry/utils';
import { convertIntegrationFnToClass, defineIntegration } from '../integration';

let originalFunctionToString: () => void;

const INTEGRATION_NAME = 'FunctionToString';

const _functionToStringIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      originalFunctionToString = Function.prototype.toString;

      // intrinsics (like Function.prototype) might be immutable in some environments
      // e.g. Node with --frozen-intrinsics, XS (an embedded JavaScript engine) or SES (a JavaScript proposal)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Function.prototype.toString = function (this: WrappedFunction, ...args: any[]): string {
          const context = getOriginalFunction(this) || this;
          return originalFunctionToString.apply(context, args);
        };
      } catch {
        // ignore errors here, just don't patch this
      }
    },
  };
}) satisfies IntegrationFn;

export const functionToStringIntegration = defineIntegration(_functionToStringIntegration);

/**
 * Patch toString calls to return proper name for wrapped functions.
 * @deprecated Use `functionToStringIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const FunctionToString = convertIntegrationFnToClass(
  INTEGRATION_NAME,
  functionToStringIntegration,
) as IntegrationClass<Integration & { setupOnce: () => void }>;
