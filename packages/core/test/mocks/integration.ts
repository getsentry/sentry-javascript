import { getCurrentHub } from '@sentry/hub';
import { configureScope } from '@sentry/minimal';
import { Event, EventProcessor, Integration } from '@sentry/types';

export class TestIntegration implements Integration {
  public static id: string = 'TestIntegration';

  public name: string = 'TestIntegration';

  public setupOnce(): void {
    const eventProcessor: EventProcessor = (event: Event) => {
      if (!getCurrentHub().getIntegration(TestIntegration)) {
        return event;
      }

      return null;
    };

    eventProcessor.id = this.name;

    configureScope(scope => {
      scope.addEventProcessor(eventProcessor);
    });
  }
}
