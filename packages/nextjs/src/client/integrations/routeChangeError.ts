import { captureException } from '@sentry/core';
import type { EventProcessor, Hub, Integration } from '@sentry/types';
import { addExceptionMechanism, stripUrlQueryAndFragment } from '@sentry/utils';
import { default as Router } from 'next/router';

import { getNextRouteFromPathname } from '../routing/pagesRouterRoutingInstrumentation';

/** Captures errors that happen during Next.js route changes */
export class RouteChangeError implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'RouteChangeError';

  /**
   * @inheritDoc
   */
  public name: string;

  /**
   * @inheritDoc
   */
  public constructor() {
    this.name = RouteChangeError.id;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    Router.events.on('routeChangeError', (err: Error & { cancelled?: boolean }, navigationTarget: string) => {
      const hub = getCurrentHub();
      const client = hub.getClient();

      if (!hub.getIntegration(RouteChangeError)) {
        return;
      }

      if (!err.cancelled) {
        captureException(err, scope => {
          const strippedNavigationTarget = stripUrlQueryAndFragment(navigationTarget);
          const matchedRoute = getNextRouteFromPathname(strippedNavigationTarget);

          if (matchedRoute) {
            scope.setExtra('requested_route', matchedRoute);
          }

          if (client && client.getOptions().sendDefaultPii) {
            scope.setExtra('requested_url', navigationTarget);
          }

          scope.addEventProcessor(event => {
            addExceptionMechanism(event, {
              handled: false,
            });
            return event;
          });

          return scope;
        });
      }
    });
  }
}
