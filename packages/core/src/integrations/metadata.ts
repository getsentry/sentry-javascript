import type { EventItem, EventProcessor, Hub, Integration } from '@sentry/types';
import { forEachEnvelopeItem } from '@sentry/utils';

import { addMetadataToStackFrames, stripMetadataFromStackFrames } from '../metadata';

/**
 * Adds module metadata to stack frames.
 *
 * Metadata can be injected by the Sentry bundler plugins using the `_experiments.moduleMetadata` config option.
 *
 * When this integration is added, the metadata passed to the bundler plugin is added to the stack frames of all events
 * under the `module_metadata` property. This can be used to help in tagging or routing of events from different teams
 * our sources
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

    // We need to strip metadata from stack frames before sending them to Sentry since these are client side only.
    client.on('beforeEnvelope', envelope => {
      forEachEnvelopeItem(envelope, (item, type) => {
        if (type === 'event' || type === 'transaction') {
          const event = Array.isArray(item) ? (item as EventItem)[1] : undefined;

          if (event) {
            stripMetadataFromStackFrames(event);
            item[1] = event;
          }
        }
      });
    });

    const stackParser = client.getOptions().stackParser;

    addGlobalEventProcessor(event => {
      addMetadataToStackFrames(stackParser, event);
      return event;
    });
  }
}
