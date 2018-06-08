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
    Raven._instrumentTryCatch();
  }
}
