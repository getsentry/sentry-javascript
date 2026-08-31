import {
  DB_COLLECTION_NAME,
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  SENTRY_KIND,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import type { Span, SpanAttributes } from '@sentry/core';
import {
  getClient,
  hasSpanStreamingEnabled,
  isObjectLike,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
} from '@sentry/core';

// `db.connection_string` is not part of `@sentry/conventions`, so it stays inlined to match
// what `@opentelemetry/instrumentation-mongodb` emitted.
const ATTR_DB_CONNECTION_STRING = 'db.connection_string';
const DB_SYSTEM_VALUE_MONGODB = 'mongodb';

/**
 * The db/collection namespace mongodb (v4+) passes to `Connection.command`
 */
export interface MongodbNamespace {
  db: string;
  collection?: string;
}

interface V4Command {
  documents?: unknown[];
  cursors?: unknown;
  [key: string]: unknown;
}

/**
 * Replaces every leaf value in the command object with '?', keeping keys
 * and Mongo operators. hides PII and improves grouping. Reproduced from
 * the OTel instrumentation.
 */
export function serializeDbStatement(commandObj: Record<string, unknown>): string {
  return JSON.stringify(scrubStatement(commandObj));
}

function scrubStatement(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(element => scrubStatement(element));
  }

  if (isCommandObj(value)) {
    const initial: Record<string, unknown> = {};
    return Object.entries(value)
      .map(([key, element]) => [key, scrubStatement(element)])
      .reduce((prev, current) => {
        if (isCommandEntry(current)) {
          prev[current[0]] = current[1];
        }
        return prev;
      }, initial);
  }

  // A value like string or number, possibly contains PII, scrub it.
  return '?';
}

function isCommandObj(value: unknown): value is Record<string, unknown> {
  return isObjectLike(value) && !isBuffer(value);
}

function isBuffer(value: unknown): boolean {
  return typeof Buffer !== 'undefined' && Buffer.isBuffer(value);
}

function isCommandEntry(value: unknown): value is [string, unknown] {
  return Array.isArray(value);
}

/**
 * Build span attributes for a mongodb v4+ command from the connection
 * context, namespace and command.
 */
export function getV4SpanAttributes(
  connectionCtx: { address?: string } | undefined,
  ns: MongodbNamespace,
  command: V4Command | undefined,
  operation: string | undefined,
  origin: string,
): SpanAttributes {
  let host: string | undefined;
  let port: string | undefined;
  if (connectionCtx) {
    const hostParts = typeof connectionCtx.address === 'string' ? connectionCtx.address.split(':') : '';
    if (hostParts.length === 2) {
      host = hostParts[0];
      port = hostParts[1];
    }
  }

  let commandObj: Record<string, unknown> | undefined;
  if (command?.documents?.[0]) {
    commandObj = command.documents[0] as Record<string, unknown>;
  } else if (command?.cursors) {
    commandObj = command.cursors as Record<string, unknown>;
  } else {
    commandObj = command;
  }

  return getSpanAttributes(ns.db, ns.collection, host, port, commandObj, operation, origin);
}

/**
 * Shared attribute builder used by both the v3 topology path and the v4+
 * connection path.
 */
export function getSpanAttributes(
  dbName: string | undefined,
  dbCollection: string | undefined,
  host: string | undefined,
  port: string | undefined,
  commandObj: Record<string, unknown> | undefined,
  operation: string | undefined,
  origin: string,
): SpanAttributes {
  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    [DB_SYSTEM_NAME]: DB_SYSTEM_VALUE_MONGODB,
    [DB_NAMESPACE]: dbName,
    [DB_COLLECTION_NAME]: dbCollection,
    [DB_OPERATION_NAME]: operation,
    [ATTR_DB_CONNECTION_STRING]: `mongodb://${host}:${port}/${dbName}`,
  };

  if (host && port) {
    attributes[SERVER_ADDRESS] = host;
    const portNumber = parseInt(port, 10);
    if (!isNaN(portNumber)) {
      attributes[SERVER_PORT] = portNumber;
    }
  }

  if (commandObj) {
    try {
      attributes[DB_QUERY_TEXT] = serializeDbStatement(commandObj);
    } catch {
      // ignore serialization errors — the statement is best-effort metadata
    }
  }

  return attributes;
}

/** The v3 driver topology, from which host/port are read (mongodb 3.x). */
export interface MongoV3Topology {
  s?: {
    options?: { host?: string; port?: number };
    host?: string;
    port?: number;
  };
  description?: { address?: string };
}

/**
 * Determine the operation name for a mongodb v3 `command` from the command
 * document, mirroring the vendored instrumentation. Returns `undefined` for
 * commands it doesn't classify (e.g. `endSessions`).
 */
export function getV3CommandOperation(command: Record<string, unknown>): string | undefined {
  if (command.createIndexes !== undefined) {
    return 'createIndexes';
  } else if (command.findandmodify !== undefined) {
    return 'findAndModify';
  } else if (command.ismaster !== undefined) {
    return 'isMaster';
  } else if (command.count !== undefined) {
    return 'count';
  } else if (command.aggregate !== undefined) {
    return 'aggregate';
  }
  return undefined;
}

/**
 * Build span attributes for a mongodb v3 operation from the topology,
 * namespace string and command.
 */
export function getV3SpanAttributes(
  ns: string,
  topology: MongoV3Topology | undefined,
  command: Record<string, unknown> | undefined,
  operation: string | undefined,
  origin: string,
): SpanAttributes {
  let host: string | undefined;
  let port: string | undefined;
  if (topology?.s) {
    host = topology.s.options?.host ?? topology.s.host;
    port = (topology.s.options?.port ?? topology.s.port)?.toString();
    if (host == null || port == null) {
      const address = topology.description?.address;
      if (address) {
        const segments = address.split(':');
        host = segments[0];
        port = segments[1];
      }
    }
  }

  // The namespace is `[db].[collection-or-index]`; coerce to string
  // (might be a MongoDBNamespace)
  const [dbName, dbCollection] = ns.toString().split('.');
  const commandObj =
    (command?.query as Record<string, unknown> | undefined) ??
    (command?.q as Record<string, unknown> | undefined) ??
    command;

  return getSpanAttributes(dbName, dbCollection, host, port, commandObj, operation, origin);
}

/**
 * Start a mongodb client span on the stable conventions.
 *
 * `op: 'db'` is set explicitly rather than relying on `inferDbSpanData`,
 * to support platforms that lack it (ie, Deno).
 */
export function startMongoSpan(attributes: SpanAttributes): Span {
  const operation = attributes[DB_OPERATION_NAME] as string | undefined;
  const target = (attributes[DB_COLLECTION_NAME] || attributes[DB_NAMESPACE]) as string | undefined;

  const client = getClient();
  const name =
    client && hasSpanStreamingEnabled(client)
      ? operation && target
        ? `${operation} ${target}`
        : target || DB_SYSTEM_VALUE_MONGODB
      : (attributes[DB_QUERY_TEXT] as string) || `mongodb.${attributes[DB_OPERATION_NAME] || 'command'}`;

  return startInactiveSpan({
    name,
    op: 'db',
    attributes: {
      [SENTRY_KIND]: 'client',
      ...attributes,
    },
  });
}
