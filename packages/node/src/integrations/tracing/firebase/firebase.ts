import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { FirebaseInstrumentation } from './otel';

const INTEGRATION_NAME = 'Firebase' as const;

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
