import { captureException } from '@sentry/minimal';
import { Integration } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils/misc';

const global: any = getGlobalObject();

/** Global Promise Rejection handler */
export class OnUnhandledRejection implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'OnUnhandledRejection';
  /**
   * @inheritDoc
   */
  public handler(event: PromiseRejectionEvent): void {
    captureException(event.reason);
  }
  /**
   * @inheritDoc
   */
  public install(): void {
    if (global.addEventListener) {
      global.addEventListener('unhandledrejection', this.handler.bind(this) as EventListener);
    }
  }
}
