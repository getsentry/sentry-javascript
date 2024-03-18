import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { applyAggregateErrorsToEvent } from '@sentry/utils';
import { exceptionFromError } from '../eventbuilder';

interface LinkedErrorsOptions {
  key?: string;
  limit?: number;
}

const DEFAULT_KEY = 'cause';
const DEFAULT_LIMIT = 5;

const INTEGRATION_NAME = 'LinkedErrors';

const _linkedErrorsIntegration = ((options: LinkedErrorsOptions = {}) => {
  const limit = options.limit || DEFAULT_LIMIT;
  const key = options.key || DEFAULT_KEY;

  return {
    name: INTEGRATION_NAME,
    preprocessEvent(event, hint, client) {
      const options = client.getOptions();

      applyAggregateErrorsToEvent(
        // This differs from the LinkedErrors integration in core by using a different exceptionFromError function
        exceptionFromError,
        options.stackParser,
        options.maxValueLength,
        key,
        limit,
        event,
        hint,
      );
    },
  };
}) satisfies IntegrationFn;

/**
 * Aggregrate linked errors in an event.
 */
export const linkedErrorsIntegration = defineIntegration(_linkedErrorsIntegration);
