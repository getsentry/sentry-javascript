import { Integration, SentryWrappedFunction } from '@sentry/types';

let originalFunctionToString: () => void;

/** Patch toString calls to return proper name for wrapped functions */
export class FunctionToString implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = FunctionToString.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'FunctionToString';

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    originalFunctionToString = Function.prototype.toString;

    Function.prototype.toString = function(this: SentryWrappedFunction, ...args: any[]): string {
      const context = this.__sentry__ ? this.__sentry_original__ : this;
      // tslint:disable-next-line:no-unsafe-any
      return originalFunctionToString.apply(context, args);
    };
  }
}
