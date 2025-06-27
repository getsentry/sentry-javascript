import type { Span } from '@opentelemetry/api';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { addOriginToSpan } from '../../../utils/addOriginToSpan';
import { type FirebaseInstrumentationConfig, FirebaseInstrumentation } from './otel';

const INTEGRATION_NAME = 'Firebase';

const config: FirebaseInstrumentationConfig = {
  firestoreSpanCreationHook: span => {
    addOriginToSpan(span as Span, 'auto.firebase.otel.firestore');

    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'db.query');
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
