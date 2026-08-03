import { SENTRY_KIND } from '@sentry/conventions/attributes';
import type { Span, SpanAttributes } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';

// OTel "OLD" db/net semantic-conventions, reproduced from the vendored
// `@opentelemetry/instrumentation-mongoose` span shape. Inlined as literals to
// avoid importing the deprecated convention constants.
const ATTR_DB_MONGODB_COLLECTION = 'db.mongodb.collection';
const ATTR_DB_NAME = 'db.name';
const ATTR_DB_USER = 'db.user';
const ATTR_NET_PEER_NAME = 'net.peer.name';
const ATTR_NET_PEER_PORT = 'net.peer.port';
const ATTR_DB_OPERATION = 'db.operation';
const ATTR_DB_SYSTEM = 'db.system';

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
 * Start a mongoose client span with the legacy (pre-stable) db/net semantic
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
    [SENTRY_KIND]: 'client',
    [ATTR_DB_MONGODB_COLLECTION]: collection?.name,
    [ATTR_DB_NAME]: collection?.conn?.name,
    [ATTR_DB_USER]: collection?.conn?.user,
    [ATTR_NET_PEER_NAME]: collection?.conn?.host,
    [ATTR_NET_PEER_PORT]: collection?.conn?.port,
    [ATTR_DB_OPERATION]: operation,
    [ATTR_DB_SYSTEM]: 'mongoose',
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
