import type { Span } from '@opentelemetry/api';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { addOriginToSpan } from '../../../utils/addOriginToSpan';
import { FirebaseInstrumentation, type FirebaseInstrumentationConfig } from './otel';

const INTEGRATION_NAME = 'Firebase';

const config: FirebaseInstrumentationConfig = {
  firestoreSpanCreationHook: (span: Span) => {
    addOriginToSpan(span, 'auto.firebase.otel.firestore');
  },
};

export const instrumentFirebase = generateInstrumentOnce(INTEGRATION_NAME, () => new FirebaseInstrumentation(config));

const _firebaseIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentFirebase();
    },
  };
}) satisfies IntegrationFn;

export const firebaseIntegration = defineIntegration(_firebaseIntegration);
