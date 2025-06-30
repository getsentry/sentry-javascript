import { defineIntegration } from '../integration';
import type { IntegrationFn } from '../types-hoist/integration';
import { applyAggregateErrorsToEvent } from '../utils/aggregate-errors';
import { exceptionFromError } from '../utils/eventbuilder';

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

      applyAggregateErrorsToEvent(exceptionFromError, options.stackParser, key, limit, event, hint);
    },
  };
}) satisfies IntegrationFn;

export const linkedErrorsIntegration = defineIntegration(_linkedErrorsIntegration);
