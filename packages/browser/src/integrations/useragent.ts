import { configureScope, getCurrentHub } from '@sentry/core';
import { Integration, SentryEvent } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils/misc';

const global = getGlobalObject() as Window;

/** UserAgent */
export class UserAgent implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'UserAgent';

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    if (getCurrentHub().getIntegration(this.name)) {
      configureScope(scope => {
        scope.addEventProcessor(async (event: SentryEvent) => {
          if (!global.navigator || !global.location) {
            return event;
          }

          // HTTP Interface: https://docs.sentry.io/clientdev/interfaces/http/?platform=javascript
          const request = event.request || {};
          request.url = request.url || global.location.href;
          request.headers = request.headers || {};
          request.headers['User-Agent'] = global.navigator.userAgent;

          return {
            ...event,
            request,
          };
        });
      });
    }
  }
}
