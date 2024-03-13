import type { EventItem, IntegrationFn } from '@sentry/types';
import { forEachEnvelopeItem } from '@sentry/utils';
import { defineIntegration } from '../integration';

import { addMetadataToStackFrames, stripMetadataFromStackFrames } from '../metadata';

const INTEGRATION_NAME = 'ModuleMetadata';

const _moduleMetadataIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      // We need to strip metadata from stack frames before sending them to Sentry since these are client side only.
      client.on('beforeEnvelope', envelope => {
        forEachEnvelopeItem(envelope, (item, type) => {
          if (type === 'event') {
            const event = Array.isArray(item) ? (item as EventItem)[1] : undefined;

            if (event) {
              stripMetadataFromStackFrames(event);
              item[1] = event;
            }
          }
        });
      });
    },

    processEvent(event, _hint, client) {
      const stackParser = client.getOptions().stackParser;
      addMetadataToStackFrames(stackParser, event);
      return event;
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds module metadata to stack frames.
 *
 * Metadata can be injected by the Sentry bundler plugins using the `_experiments.moduleMetadata` config option.
 *
 * When this integration is added, the metadata passed to the bundler plugin is added to the stack frames of all events
 * under the `module_metadata` property. This can be used to help in tagging or routing of events from different teams
 * our sources
 */
export const moduleMetadataIntegration = defineIntegration(_moduleMetadataIntegration);
