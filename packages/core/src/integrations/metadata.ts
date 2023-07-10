import type { Event, EventItem, EventProcessor, Hub, Integration } from '@sentry/types';
import { forEachEnvelopeItem } from '@sentry/utils';

import { addMetadataToStackFrames, stripMetadataFromStackFrames } from '../metadata';

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

    if (!client || typeof client.on !== 'function') {
      return;
    }

    client.on('beforeEnvelope', envelope => {
      forEachEnvelopeItem(envelope, (item, type) => {
        if (type === 'event' || type === 'transaction') {
          const event = Array.isArray(item) ? (item as EventItem)[1] : undefined;

          if (event) {
            stripMetadataFromStackFrames(event);
            (item as EventItem)[1] = event;
          }
        }
      });
    });

    const stackParser = client.getOptions().stackParser;

    addGlobalEventProcessor((event: Event) => {
      addMetadataToStackFrames(stackParser, event);
      return event;
    });
  }
}
