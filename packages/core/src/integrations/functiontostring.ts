import type { Integration, WrappedFunction } from '@sentry/types';
import { getOriginalFunction } from '@sentry/utils';

let originalFunctionToString: () => void;

/** Patch toString calls to return proper name for wrapped functions */
export class FunctionToString implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'FunctionToString';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    this.name = FunctionToString.id;
  }

  /**
   * @inheritDoc
   */
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
