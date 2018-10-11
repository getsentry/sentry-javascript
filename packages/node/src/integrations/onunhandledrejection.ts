import { getCurrentHub } from '@sentry/core';
import { Integration } from '@sentry/types';

/** Global Promise Rejection handler */
export class OnUnhandledRejection implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'OnUnhandledRejection';
  /**
   * @inheritDoc
   */
  public static id: string = 'OnUnhandledRejection';

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    global.process.on('unhandledRejection', this.sendUnhandledPromise.bind(this));
  }

  /**
   * Send an exception with reason
   * @param reason string
   * @param promise promise
   */
  public sendUnhandledPromise(reason: any, promise: any): void {
    if (!getCurrentHub().getIntegration(OnUnhandledRejection)) {
      return;
    }
    const context = (promise.domain && promise.domain.sentryContext) || {};
    getCurrentHub().withScope(() => {
      getCurrentHub().configureScope(scope => {
        // Preserve backwards compatibility with raven-node for now
        if (context.user) {
          scope.setUser(context.user);
        }
        if (context.tags) {
          Object.keys(context.tags).forEach(key => {
            scope.setTag(key, context.tags[key]);
          });
        }
        if (context.extra) {
          Object.keys(context.extra).forEach(key => {
            scope.setExtra(key, context.extra[key]);
          });
        }
        scope.setExtra('unhandledPromiseRejection', true);
      });
      getCurrentHub().captureException(reason, { originalException: promise });
    });
  }
}
