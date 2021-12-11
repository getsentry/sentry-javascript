import { Event, EventProcessor, Hub, Integration } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils';

const global = getGlobalObject<Window>();

/** UserAgent */
export class UserAgent implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'UserAgent';

  /**
   * @inheritDoc
   */
  public name: string = UserAgent.id;

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    addGlobalEventProcessor((event: Event) => {
      if (getCurrentHub().getIntegration(UserAgent)) {
        const { navigator, location, document } = global;
        // if none of the information we want exists, don't bother
        if (!navigator && !location && !document) {
          return event;
        }

        const req = event.request;
        const headers = req && req.headers ? { ...req.headers } : {};

        const { userAgent } = navigator;
        if (userAgent) {
          headers['User-Agent'] = userAgent;
        }

        const { referrer } = document;
        if (referrer) {
          headers.Referer = referrer;
        }

        const request = { headers } as Record<string, unknown>;

        const url = (req && req.url) || location.href;
        if (url) {
          request.url = url;
        }

        return { ...event, request };
      }
      return event;
    });
  }
}
