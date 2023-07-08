import type { Event, EventProcessor, Hub, Integration } from '@sentry/types';

import { addMetadataToStackFrames } from '../metadata';

/**
 * Adds module metadata to stack frames.
 *
 * Metadata can be injected by the Sentry bundler plugins using the `_experiments.moduleMetadata` config option.
 */
export class ModuleMetadata implements Integration {
  /*
   * @inheritDoc
   */
  public static id: string = 'ModuleMetadata';

  /**
   * @inheritDoc
   */
  public name: string = ModuleMetadata.id;

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (processor: EventProcessor) => void, getCurrentHub: () => Hub): void {
    const client = getCurrentHub().getClient();

    if (!client) {
      return;
    }

    const stackParser = client.getOptions().stackParser;

    addGlobalEventProcessor((event: Event) => {
      addMetadataToStackFrames(stackParser, event);
      return event;
    });
  }
}
