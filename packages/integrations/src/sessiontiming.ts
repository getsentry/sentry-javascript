import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

const INTEGRATION_NAME = 'SessionTiming';

const _sessionTimingIntegration = (() => {
  const startTime = Date.now();

  return {
    name: INTEGRATION_NAME,
    // TODO v8: Remove this
    setupOnce() {}, // eslint-disable-line @typescript-eslint/no-empty-function
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
