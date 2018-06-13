import { Hub } from '@sentry/hub';
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
  public install(): void {
    global.process.on('unhandledRejection', (reason, promise: any = {}) => {
      const context = (promise.domain && promise.domain.sentryContext) || {};
      const hub = Hub.getGlobal();
      hub.withScope(() => {
        hub.configureScope(scope => {
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
        hub.captureException(reason);
      });
    });
  }
}
