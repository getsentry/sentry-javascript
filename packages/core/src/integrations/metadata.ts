import type { EventItem, Exception, IntegrationFn } from '@sentry/types';
import { forEachEnvelopeItem } from '@sentry/utils';
import { defineIntegration } from '../integration';

import { addMetadataToStackFrames, stripMetadataFromStackFrames } from '../metadata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ModuleMetadata = any;

function getAllModuleMetadata(exceptions: Exception[]): ModuleMetadata[] {
  return exceptions.reduce(
    (acc, exception) => {
      if (exception.stacktrace && exception.stacktrace.frames) {
        acc.push(...exception.stacktrace.frames.map(frame => frame.module_metadata));
      }
      return acc;
    },
    [] as ModuleMetadata[],
  );
}

interface Options {
  dropEvent?: {
    /**
     * Drop event if no stack frames have matching metadata
     */
    ifNoStackFrameMetadataMatches?: (metadata: ModuleMetadata) => boolean;
  };
}

const _moduleMetadataIntegration = ((options: Options = {}) => {
  return {
    name: 'ModuleMetadata',
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

      if (
        event.exception &&
        event.exception.values &&
        options.dropEvent &&
        options.dropEvent.ifNoStackFrameMetadataMatches
      ) {
        const metadata = getAllModuleMetadata(event.exception.values);
        if (!metadata.some(options.dropEvent.ifNoStackFrameMetadataMatches)) {
          return null;
        }
      }

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
