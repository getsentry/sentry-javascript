import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, getClient } from '@sentry/core';
import { instrumentRemix } from './tracing-channel';
import type { RemixOptions } from '../../utils/remixOptions';

const INTEGRATION_NAME = 'Remix' as const;

const _remixIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      const client = getClient();
      const options = client?.getOptions() as RemixOptions | undefined;
      const actionFormDataAttributes = client?.getDataCollectionOptions().httpBodies.includes('incomingRequest')
        ? options?.captureActionFormDataKeys
        : undefined;

      instrumentRemix(actionFormDataAttributes);
    },
  };
}) satisfies IntegrationFn;

/**
 * Instrument server-side Remix requests to emit spans.
 */
export const remixIntegration = defineIntegration(_remixIntegration);
