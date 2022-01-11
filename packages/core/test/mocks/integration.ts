import { getCurrentHub, getIntegration } from '@sentry/hub';
import { configureScope } from '@sentry/minimal';
import { Event, Integration } from '@sentry/types';

export class TestIntegration implements Integration {
  public static id: string = 'TestIntegration';

  public name: string = 'TestIntegration';

  public setupOnce(): void {
    configureScope(scope => {
      scope.addEventProcessor((event: Event) => {
        if (!getIntegration(getCurrentHub(), TestIntegration)) {
          return event;
        }

        return null;
      });
    });
  }
}
