import { SENTRY_KIND } from '@sentry/conventions/attributes';
import type { Span, SpanAttributes } from '@sentry/core';
import { isObjectLike, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';

// OTel "OLD" db/net semantic-conventions, reproduced from the vendored
// `@opentelemetry/instrumentation-mongodb` span shape so the orchestrion
// spans match the OTel ones byte-for-byte. Inlined as literals to avoid
// importing the deprecated convention constants.
const ATTR_DB_SYSTEM = 'db.system';
const ATTR_DB_NAME = 'db.name';
const ATTR_DB_OPERATION = 'db.operation';
const ATTR_DB_STATEMENT = 'db.statement';
const ATTR_DB_MONGODB_COLLECTION = 'db.mongodb.collection';
const ATTR_DB_CONNECTION_STRING = 'db.connection_string';
const ATTR_NET_PEER_NAME = 'net.peer.name';
const ATTR_NET_PEER_PORT = 'net.peer.port';
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
    [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_MONGODB,
    [ATTR_DB_NAME]: dbName,
    [ATTR_DB_MONGODB_COLLECTION]: dbCollection,
    [ATTR_DB_OPERATION]: operation,
    [ATTR_DB_CONNECTION_STRING]: `mongodb://${host}:${port}/${dbName}`,
  };

  if (host && port) {
    attributes[ATTR_NET_PEER_NAME] = host;
    const portNumber = parseInt(port, 10);
    if (!isNaN(portNumber)) {
      attributes[ATTR_NET_PEER_PORT] = portNumber;
    }
  }

  if (commandObj) {
    try {
      attributes[ATTR_DB_STATEMENT] = serializeDbStatement(commandObj);
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
 * Start a mongodb client span with the legacy (pre-stable) db/net semantic
 * conventions.
 *
 * `op: 'db'` is set explicitly rather than relying on `inferDbSpanData`,
 * to support platforms that lack it (ie, Deno).
 */
export function startMongoSpan(attributes: SpanAttributes): Span {
  return startInactiveSpan({
    name: `mongodb.${attributes[ATTR_DB_OPERATION] || 'command'}`,
    op: 'db',
    attributes: {
      [SENTRY_KIND]: 'client',
      ...attributes,
    },
  });
}
