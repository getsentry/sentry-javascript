import { MySQL2Instrumentation } from '@opentelemetry/instrumentation-mysql2';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const INTEGRATION_NAME = 'Mysql2';

export const instrumentMysql2 = generateInstrumentOnce(
  INTEGRATION_NAME,
  () =>
    new MySQL2Instrumentation({
      responseHook(span) {
        addOriginToSpan(span, 'auto.db.otel.mysql2');
      },
    }),
);

const _mysql2Integration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentMysql2();
    },
  };
}) satisfies IntegrationFn;

/**
 * MySQL2 integration
 *
 * Capture tracing data for mysql2
 */
export const mysql2Integration = defineIntegration(_mysql2Integration);
