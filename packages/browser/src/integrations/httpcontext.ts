import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Event, Integration } from '@sentry/types';

import { WINDOW } from '../helpers';

/** HttpContext integration collects information about HTTP request headers */
export class HttpContext implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'HttpContext';

  /**
   * @inheritDoc
   */
  public name: string = HttpContext.id;

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor((event: Event) => {
      if (getCurrentHub().getIntegration(HttpContext)) {
        // if none of the information we want exists, don't bother
        if (!WINDOW.navigator && !WINDOW.location && !WINDOW.document) {
          return event;
        }

        // grab as much info as exists and add it to the event
        const url = (event.request && event.request.url) || (WINDOW.location && WINDOW.location.href);
        const { referrer } = WINDOW.document || {};
        const { userAgent } = WINDOW.navigator || {};

        const headers = {
          ...(event.request && event.request.headers),
          ...(referrer && { Referer: referrer }),
          ...(userAgent && { 'User-Agent': userAgent }),
        };
        const request = { ...(url && { url }), headers };

        return { ...event, request };
      }
      return event;
    });
  }
}
