import type { Client } from '../../src';
import { getClient, getCurrentScope } from '../../src';
import type { Event } from '../../src/types-hoist/event';
import type { EventProcessor } from '../../src/types-hoist/eventprocessor';
import type { Integration } from '../../src/types-hoist/integration';

export class TestIntegration implements Integration {
  public static id: string = 'TestIntegration';

  public name: string = 'TestIntegration';

  public setupOnce(): void {
    const eventProcessor: EventProcessor = (event: Event) => {
      if (!getClient()?.getIntegrationByName('TestIntegration')) {
        return event;
      }

      return null;
    };

    eventProcessor.id = this.name;

    getCurrentScope().addEventProcessor(eventProcessor);
  }
}

export class AsyncTestIntegration implements Integration {
  public static id: string = 'AsyncTestIntegration';

  public name: string = 'AsyncTestIntegration';

  processEvent(event: Event): Event | null | PromiseLike<Event | null> {
    return new Promise(resolve => setTimeout(() => resolve(event), 1));
  }
}

export class AddAttachmentTestIntegration implements Integration {
  public static id: string = 'AddAttachmentTestIntegration';

  public name: string = 'AddAttachmentTestIntegration';

  public setup(client: Client): void {
    client.addEventProcessor((event, hint) => {
      hint.attachments = [...(hint.attachments || []), { filename: 'integration.file', data: 'great content!' }];
      return event;
    });
  }
}

export class AdHocIntegration implements Integration {
  public static id: string = 'AdHockIntegration';

  public name: string = 'AdHockIntegration';

  public setupOnce(): void {
    // Noop
  }
}
