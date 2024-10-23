import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const INTEGRATION_NAME = 'Mongo';

export const instrumentMongo = generateInstrumentOnce(
  INTEGRATION_NAME,
  () =>
    new MongoDBInstrumentation({
      dbStatementSerializer: _defaultDbStatementSerializer,
      responseHook(span) {
        addOriginToSpan(span, 'auto.db.otel.mongo');
      },
    }),
);

/**
 * Replaces values in document with '?', hiding PII and helping grouping.
 */
export function _defaultDbStatementSerializer(commandObj: Record<string, unknown>): string {
  const resultObj = _scrubStatement(commandObj);
  return JSON.stringify(resultObj);
}

function _scrubStatement(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(element => _scrubStatement(element));
  }

  if (isCommandObj(value)) {
    const initial: Record<string, unknown> = {};
    return Object.entries(value).map(([key, element]) => [
      key,
      _scrubStatement(element),
    ]).reduce((prev, current) => {
      if (isCommandEntry(current)) {
        prev[current[0]] = current[1];
      }
      return prev;
    }, initial);
  }

  // A value like string or number, possible contains PII, scrub it
  return '?';
}

function isCommandObj(value: Record<string, unknown> | unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !isBuffer(value);
}

function isBuffer(value: unknown): boolean {
  let isBuffer = false;
  if (typeof Buffer !== 'undefined') {
    isBuffer = Buffer.isBuffer(value);
  }
  return isBuffer;
}

function isCommandEntry(value:  [string, unknown]  | unknown): value is [string, unknown] {
  return Array.isArray(value);
}

const _mongoIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentMongo();
    },
  };
}) satisfies IntegrationFn;

/**
 * MongoDB integration
 *
 * Capture tracing data for MongoDB.
 */
export const mongoIntegration = defineIntegration(_mongoIntegration);
