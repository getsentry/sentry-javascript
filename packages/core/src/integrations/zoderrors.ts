import type { IntegrationFn } from '@sentry/types';
import { applyZodErrorsToEvent } from '@sentry/utils';
import { defineIntegration } from '../integration';

interface ZodErrorsOptions {
  key?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 10;
const INTEGRATION_NAME = 'ZodErrors';

const _zodErrorsIntegration = ((options: ZodErrorsOptions = {}) => {
  const limit = options.limit || DEFAULT_LIMIT;

  return {
    name: INTEGRATION_NAME,
    processEvent(originalEvent, hint) {
      const processedEvent = applyZodErrorsToEvent(limit, originalEvent, hint);
      return processedEvent;
    },
  };
}) satisfies IntegrationFn;

export const zodErrorsIntegration = defineIntegration(_zodErrorsIntegration);
