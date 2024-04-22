import type { Client, Event, EventHint } from '@sentry/types';
import { defineIntegration } from '../integration';
import { getFilenameDebugIdMap } from '../utils/prepareEvent';

/**
 * Sets the `in_app` property on stack frames according to whether the file has a debugId.
 */
export const inAppIntegration = defineIntegration(() => {
  return {
    name: 'InApp',
    processEvent: (event: Event, _: EventHint, client: Client) => {
      const stackParser = client.getOptions().stackParser;
      const debugIds = new Set(Object.keys(getFilenameDebugIdMap(stackParser)));

      if (debugIds.size === 0) {
        return event;
      }

      if (event.exception) {
        for (const exception of event.exception.values || []) {
          if (exception.stacktrace) {
            for (const frame of exception.stacktrace.frames || []) {
              frame.in_app = !!(frame.filename && debugIds.has(frame.filename));
            }
          }
        }
      }

      return event;
    },
  };
});
