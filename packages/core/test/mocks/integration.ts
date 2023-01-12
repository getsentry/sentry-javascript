import type { Event, EventProcessor, Integration } from '@sentry/types';

import { configureScope, getCurrentHub } from '../../src';

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

export class AddAttachmentTestIntegration implements Integration {
  public static id: string = 'AddAttachmentTestIntegration';

  public name: string = 'AddAttachmentTestIntegration';

  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    addGlobalEventProcessor((event, hint) => {
      hint.attachments = [...(hint.attachments || []), { filename: 'integration.file', data: 'great content!' }];
      return event;
    });
  }
}
