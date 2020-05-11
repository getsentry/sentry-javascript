import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Event, Integration } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils';

const global = getGlobalObject<Window>();

/** UserAgent */
export class UserAgent implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = UserAgent.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'UserAgent';

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor((event: Event) => {
      if (getCurrentHub().getIntegration(UserAgent)) {
        if (!global.navigator || !global.location) {
          return event;
        }

        const request = event.request || {};
        request.url = request.url || global.location.href;
        request.headers = request.headers || {};
        request.headers['User-Agent'] = global.navigator.userAgent;

        return {
          ...event,
          request,
        };
      }
      return event;
    });
  }
}
