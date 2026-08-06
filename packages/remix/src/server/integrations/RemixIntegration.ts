import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, getClient } from '@sentry/core';
import { instrumentRemix } from './tracing-channel';
import { resolveFormDataCapture } from '../../utils/formData';

const INTEGRATION_NAME = 'Remix' as const;

const _remixIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentRemix(resolveFormDataCapture(getClient()));
    },
  };
}) satisfies IntegrationFn;

/**
 * Instrument server-side Remix requests to emit spans.
 */
export const remixIntegration = defineIntegration(_remixIntegration);
