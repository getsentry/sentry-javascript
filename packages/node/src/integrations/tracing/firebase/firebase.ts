import type { IntegrationFn } from '@sentry/core';
import { captureException, defineIntegration, flush, SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core';
import { addOriginToSpan, generateInstrumentOnce } from '@sentry/node-core';
import { FirebaseInstrumentation, type FirebaseInstrumentationConfig } from './otel';

const INTEGRATION_NAME = 'Firebase';

const config: FirebaseInstrumentationConfig = {
  firestoreSpanCreationHook: span => {
    addOriginToSpan(span, 'auto.firebase.otel.firestore');

    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'db.query');
  },
  functions: {
    requestHook: span => {
      addOriginToSpan(span, 'auto.firebase.otel.functions');

      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'http.request');
    },
    errorHook: async (_, error) => {
      if (error) {
        captureException(error, {
          mechanism: {
            type: 'auto.firebase.otel.functions',
            handled: false,
          },
        });
        await flush(2000);
      }
    },
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
