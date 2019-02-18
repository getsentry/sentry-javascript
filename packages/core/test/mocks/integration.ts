import { getCurrentHub } from '@sentry/hub';
import { configureScope } from '@sentry/minimal';
import { Event, Integration } from '@sentry/types';

export class TestIntegration implements Integration {
  public name: string = 'TestIntegration';
  public static id: string = 'TestIntegration';

  public setupOnce(): void {
    configureScope(scope => {
      scope.addEventProcessor((event: Event) => {
        if (!getCurrentHub().getIntegration(TestIntegration)) {
          return event;
        }

        if (true) {
          return null;
        }

        // return event;
      });
    });
  }
}
