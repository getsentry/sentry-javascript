import type { IntegrationFn } from '@sentry/types';
import { timestampInSeconds } from '@sentry/utils';
import { defineIntegration } from '../integration';

const INTEGRATION_NAME = 'SessionTiming';

const _sessionTimingIntegration = (() => {
  const startTime = timestampInSeconds() * 1000;

  return {
    name: INTEGRATION_NAME,
    processEvent(event) {
      const now = timestampInSeconds() * 1000;

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
