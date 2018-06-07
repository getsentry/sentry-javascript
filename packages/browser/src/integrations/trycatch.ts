import { Integration } from '@sentry/types';
import { Raven } from '../raven';

/** Wrap timer functions and event targets to catch errors and provide better meta data */
export class TryCatch implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'TryCatch';
  /**
   * @inheritDoc
   */
  public install(): void {
    // tslint:disable-next-line:no-unsafe-any
    Raven._instrumentTryCatch();
  }
}
