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
import { getClient, hasSpanStreamingEnabled, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';

const DB_SYSTEM_NAME_VALUE_MONGODB = 'mongodb';

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
 * conventions. `db.system.name` deliberately deviates from what the OTel
 * instrumentation emitted: mongoose is an ODM, the database system is mongodb.
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
  const collectionName = collection?.name;
  const namespace = collection?.conn?.name;

  const attributes: SpanAttributes = {
    [SENTRY_OP]: DB,
    [SENTRY_KIND]: 'client',
    [DB_COLLECTION_NAME]: collectionName,
    [DB_NAMESPACE]: namespace,
    [DB_USER]: collection?.conn?.user,
    [SERVER_ADDRESS]: collection?.conn?.host,
    [SERVER_PORT]: collection?.conn?.port,
    [DB_OPERATION_NAME]: operation,
    [DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_MONGODB,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
  };

  const client = getClient();
  const target = collectionName || namespace;
  const name =
    client && hasSpanStreamingEnabled(client)
      ? target
        ? `${operation} ${target}`
        : DB_SYSTEM_NAME_VALUE_MONGODB
      : `mongoose.${modelName}.${operation}`;

  return startInactiveSpan({
    name,
    // Set this explicitly, for platforms lacking `inferDbSpanData`
    attributes,
    parentSpan,
  });
}
