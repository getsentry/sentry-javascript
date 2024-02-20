import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { MySQL2Instrumentation } from '@opentelemetry/instrumentation-mysql2';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const _mysql2Integration = (() => {
  return {
    name: 'Mysql2',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new MySQL2Instrumentation({
            responseHook(span) {
              addOriginToSpan(span, 'auto.db.otel.mysql2');
            },
          }),
        ],
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * MySQL2 integration
 *
 * Capture tracing data for mysql2
 */
export const mysql2Integration = defineIntegration(_mysql2Integration);
