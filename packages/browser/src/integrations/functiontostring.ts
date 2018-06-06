import { Integration } from '@sentry/types';
import { Raven } from '../raven';

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
    // tslint:disable-next-line:no-unsafe-any
    Raven._patchFunctionToString();
  }
  /**
   * @inheritDoc
   */
  public uninstall(): void {
    // tslint:disable-next-line:no-unsafe-any
    Raven._unpatchFunctionToString();
  }
}
