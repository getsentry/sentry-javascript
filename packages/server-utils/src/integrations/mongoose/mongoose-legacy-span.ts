import {
  DB_COLLECTION_NAME,
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_SYSTEM_NAME,
  DB_USER,
  SENTRY_KIND,
  SENTRY_OP,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import type { Span, SpanAttributes } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';

/** The subset of mongoose's `Collection` that the legacy span shape reads. */
export interface MongooseLegacyCollection {
  name?: string;
  conn?: { name?: string; user?: string; host?: string; port?: number };
}

export interface StartMongooseLegacySpanOptions {
  collection: MongooseLegacyCollection | undefined;
  modelName: string | undefined;
  operation: string;
  origin: string;
  parentSpan?: Span;
}

/**
 * Start a mongoose client span reproducing the vendored
 * `@opentelemetry/instrumentation-mongoose` span shape, on the stable
 * conventions.
 *
 * Shared by the vendored OTel/IITM instrumentation (`@sentry/node`) and the
 * orchestrion channel subscriber so the two emit an identical span shape,
 * differing only by `origin`.
 */
export function startMongooseLegacySpan({
  collection,
  modelName,
  operation,
  origin,
  parentSpan,
}: StartMongooseLegacySpanOptions): Span {
  const attributes: SpanAttributes = {
    [SENTRY_OP]: DB,
    [SENTRY_KIND]: 'client',
    [DB_COLLECTION_NAME]: collection?.name,
    [DB_NAMESPACE]: collection?.conn?.name,
    [DB_USER]: collection?.conn?.user,
    [SERVER_ADDRESS]: collection?.conn?.host,
    [SERVER_PORT]: collection?.conn?.port,
    [DB_OPERATION_NAME]: operation,
    [DB_SYSTEM_NAME]: 'mongoose',
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
  };

  return startInactiveSpan({
    name: `mongoose.${modelName}.${operation}`,
    // Set this explicitly, for platforms lacking `inferDbSpanData`
    attributes,
    parentSpan,
  });
}
