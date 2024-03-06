import type { Event, EventHint, IntegrationFn } from '@sentry/types';
import { consoleSandbox } from '@sentry/utils';
import { defineIntegration } from '../integration';

const INTEGRATION_NAME = 'Debug';

interface DebugOptions {
  /** Controls whether console output created by this integration should be stringified. Default: `false` */
  stringify?: boolean;
  /** Controls whether a debugger should be launched before an event is sent. Default: `false` */
  debugger?: boolean;
}

/**
 * Integration to debug sent Sentry events.
 * This integration should not be used in production.
 */
const _debugIntegration = ((options: DebugOptions = {}) => {
  const _options = {
    debugger: false,
    stringify: false,
    ...options,
  };

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      client.on('beforeSendEvent', (event: Event, hint?: EventHint) => {
        if (_options.debugger) {
          // eslint-disable-next-line no-debugger
          debugger;
        }

        /* eslint-disable no-console */
        consoleSandbox(() => {
          if (_options.stringify) {
            console.log(JSON.stringify(event, null, 2));
            if (hint && Object.keys(hint).length) {
              console.log(JSON.stringify(hint, null, 2));
            }
          } else {
            console.log(event);
            if (hint && Object.keys(hint).length) {
              console.log(hint);
            }
          }
        });
        /* eslint-enable no-console */
      });
    },
  };
}) satisfies IntegrationFn;

export const debugIntegration = defineIntegration(_debugIntegration);
