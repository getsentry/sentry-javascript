import { Integration, SentryWrappedFunction } from '@sentry/types';

let originalFunctionToString: () => void;

/** Patch toString calls to return proper name for wrapped functions */
export class FunctionToString implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'FunctionToString';
  /**
   * @inheritDoc
   */
  public install(): void {
    originalFunctionToString = Function.prototype.toString;

    Function.prototype.toString = function(
      this: SentryWrappedFunction,
      ...args: any[]
    ): string {
      if (typeof this === 'function' && this.__sentry__) {
        return originalFunctionToString.apply(this.__sentry_original__, args);
      }
      return originalFunctionToString.apply(this, args);
    };
  }
}
