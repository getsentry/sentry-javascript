import { Raven } from '../raven';
import { Integration } from '@sentry/types';

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
    global.process.on('uncaughtException', Raven.uncaughtErrorHandler);
  }
  /**
   * @inheritDoc
   */
  public uninstall(): void {
    global.process.removeAllListeners('uncaughtException');
  }
}
