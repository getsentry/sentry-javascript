import type { Span } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { defineIntegration, SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { addOriginToSpan } from '../../../utils/addOriginToSpan';
import { FirebaseInstrumentation, type FirebaseInstrumentationConfig } from './otel';
import { ATTR_DB_OPERATION_NAME } from './otel/otelMissingSemanticConventions';

const INTEGRATION_NAME = 'Firebase';

const config: FirebaseInstrumentationConfig = {
  firestoreSpanCreationHook: (span) => {
    addOriginToSpan(span as Span, 'auto.firebase.otel.firestore');
    let operation = 'db.query';

    const readableSpan = span as unknown as ReadableSpan;

    if (readableSpan.attributes && typeof readableSpan.attributes[ATTR_DB_OPERATION_NAME] === 'string') {
      operation = readableSpan.attributes[ATTR_DB_OPERATION_NAME];
    }

    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, operation);
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
