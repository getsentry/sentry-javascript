import type { Integration, WrappedFunction } from '@sentry/types';
import { getOriginalFunction } from '@sentry/utils';
import { defineSentryIntegration } from '../integration';

let originalFunctionToString: () => void;

const INTEGRATION_NAME = 'FunctionToString';

/**
 * Patch toString calls to return proper name for wrapped functions
 */
export const functionToStringIntegration = defineSentryIntegration(() => {
  // eslint-disable-next-line deprecation/deprecation
  return new FunctionToString();
});

/**
 * Patch toString calls to return proper name for wrapped functions
 *
 * @deprecated Use `functionToStringIntegration()` instead.
 */
export class FunctionToString implements Integration {
  public static id = INTEGRATION_NAME;

  public name: typeof INTEGRATION_NAME;

  public constructor() {
    this.name = INTEGRATION_NAME;
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public setupOnce(): void {
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
  }
}
