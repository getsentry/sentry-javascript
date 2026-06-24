import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';
import { FirebaseInstrumentation } from './otel';

const INTEGRATION_NAME = 'Firebase';

export const instrumentFirebase = generateInstrumentOnce(INTEGRATION_NAME, () => new FirebaseInstrumentation());

const _firebaseIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentFirebase();
    },
  };
}) satisfies IntegrationFn;

export const firebaseIntegration = defineIntegration(_firebaseIntegration);
