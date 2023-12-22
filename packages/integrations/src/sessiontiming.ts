import { convertIntegrationFnToClass } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

const INTEGRATION_NAME = 'SessionTiming';

const sessionTimingIntegration = (() => {
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

/** This function adds duration since Sentry was initialized till the time event was sent */
// eslint-disable-next-line deprecation/deprecation
export const SessionTiming = convertIntegrationFnToClass(INTEGRATION_NAME, sessionTimingIntegration);
