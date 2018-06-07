import { Integration } from '@sentry/types';
import { Raven } from '../raven';

/** Global Promise Rejection handler */
export class OnUncaughtException implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'OnUncaughtException';
  /**
   * @inheritDoc
   */
  public install(): void {
    global.process.on(
      'uncaughtException',
      Raven.uncaughtErrorHandler.bind(Raven),
    );
  }
}
