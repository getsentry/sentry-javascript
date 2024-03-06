import type { IntegrationFn } from '@sentry/types';
import { defineIntegration } from '../integration';

const INTEGRATION_NAME = 'SessionTiming';

const _sessionTimingIntegration = (() => {
  const startTime = Date.now();

  return {
    name: INTEGRATION_NAME,
    processEvent(event) {
      const now = Date.now();

      return {
        ...event,
        extra: {
          ...event.extra,
          ['session:start']: startTime,
          ['session:duration']: now - startTime,
          ['session:end']: now,
        },
      };
    },
  };
}) satisfies IntegrationFn;

/**
 * This function adds duration since the sessionTimingIntegration was initialized
 * till the time event was sent.
 */
export const sessionTimingIntegration = defineIntegration(_sessionTimingIntegration);
