import {
  DB_COLLECTION_NAME,
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_SYSTEM_NAME,
  DB_USER,
  SENTRY_KIND,
} from '@sentry/conventions/attributes';
import type { Span, SpanAttributes } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';

// OTel "OLD" net semantic-conventions, reproduced from the vendored
// `@opentelemetry/instrumentation-mongoose` span shape. Inlined as literals to
// avoid importing the deprecated convention constants.
const ATTR_NET_PEER_NAME = 'net.peer.name';
const ATTR_NET_PEER_PORT = 'net.peer.port';

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
 * `@opentelemetry/instrumentation-mongoose` span shape, with the db attributes
 * on the stable conventions and the net attributes still on the legacy ones.
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
    [SENTRY_KIND]: 'client',
    [DB_COLLECTION_NAME]: collection?.name,
    [DB_NAMESPACE]: collection?.conn?.name,
    [DB_USER]: collection?.conn?.user,
    [ATTR_NET_PEER_NAME]: collection?.conn?.host,
    [ATTR_NET_PEER_PORT]: collection?.conn?.port,
    [DB_OPERATION_NAME]: operation,
    [DB_SYSTEM_NAME]: 'mongoose',
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
  };

  return startInactiveSpan({
    name: `mongoose.${modelName}.${operation}`,
    // Set this explicitly, for platforms lacking `inferDbSpanData`
    op: 'db',
    attributes,
    parentSpan,
  });
}
