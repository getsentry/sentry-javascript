/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mongodb
 * - Upstream version: @opentelemetry/instrumentation-mongodb@0.71.0
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 */

import type { Span, SpanAttributes } from '@sentry/core';
import {
  getActiveSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_KIND,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  withActiveSpan,
} from '@sentry/core';
import {
  ATTR_DB_CONNECTION_STRING,
  ATTR_DB_MONGODB_COLLECTION,
  ATTR_DB_NAME,
  ATTR_DB_OPERATION,
  ATTR_DB_STATEMENT,
  ATTR_DB_SYSTEM,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
  DB_SYSTEM_VALUE_MONGODB,
} from './semconv';
import type { MongodbNamespace, MongoInternalCommand, MongoInternalTopology } from './internal-types';
import { MongodbCommandType } from './internal-types';

const ORIGIN = 'auto.db.otel.mongo';

/**
 * Replaces values in the command object with '?', hiding PII and helping grouping.
 */
function serializeDbStatement(commandObj: Record<string, unknown>): string {
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

  // A value like string or number, possibly contains PII, scrub it
  return '?';
}

function isCommandObj(value: Record<string, unknown> | unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !isBuffer(value);
}

function isBuffer(value: unknown): boolean {
  return typeof Buffer !== 'undefined' && Buffer.isBuffer(value);
}

function isCommandEntry(value: [string, unknown] | unknown): value is [string, unknown] {
  return Array.isArray(value);
}

/**
 * Get the mongodb command type from the object.
 */
export function getCommandType(command: MongoInternalCommand): MongodbCommandType {
  if (command.createIndexes !== undefined) {
    return MongodbCommandType.CREATE_INDEXES;
  } else if (command.findandmodify !== undefined) {
    return MongodbCommandType.FIND_AND_MODIFY;
  } else if (command.ismaster !== undefined) {
    return MongodbCommandType.IS_MASTER;
  } else if (command.count !== undefined) {
    return MongodbCommandType.COUNT;
  } else if (command.aggregate !== undefined) {
    return MongodbCommandType.AGGREGATE;
  } else {
    return MongodbCommandType.UNKNOWN;
  }
}

/**
 * Determine a span's attributes by fetching related metadata from the v4 connection context.
 */
export function getV4SpanAttributes(
  connectionCtx: any,
  ns: MongodbNamespace,
  command?: any,
  operation?: string,
): SpanAttributes {
  let host, port: undefined | string;
  if (connectionCtx) {
    const hostParts = typeof connectionCtx.address === 'string' ? connectionCtx.address.split(':') : '';
    if (hostParts.length === 2) {
      host = hostParts[0];
      port = hostParts[1];
    }
  }
  let commandObj: Record<string, unknown>;
  if (command?.documents && command.documents[0]) {
    commandObj = command.documents[0];
  } else if (command?.cursors) {
    commandObj = command.cursors;
  } else {
    commandObj = command;
  }

  return getSpanAttributes(ns.db, ns.collection, host, port, commandObj, operation);
}

/**
 * Determine a span's attributes by fetching related metadata from the v3 topology.
 */
export function getV3SpanAttributes(
  ns: string,
  topology: MongoInternalTopology,
  command?: MongoInternalCommand,
  operation?: string | undefined,
): SpanAttributes {
  let host: undefined | string;
  let port: undefined | string;
  if (topology?.s) {
    host = topology.s.options?.host ?? topology.s.host;
    port = (topology.s.options?.port ?? topology.s.port)?.toString();
    if (host == null || port == null) {
      const address = topology.description?.address;
      if (address) {
        const addressSegments = address.split(':');
        host = addressSegments[0];
        port = addressSegments[1];
      }
    }
  }

  // The namespace is a combination of the database name and the name of the
  // collection or index, like so: [database-name].[collection-or-index-name].
  // It could be a string or an instance of MongoDBNamespace, as such we
  // always coerce to a string to extract db and collection.
  const [dbName, dbCollection] = ns.toString().split('.');
  const commandObj = command?.query ?? command?.q ?? command;

  return getSpanAttributes(dbName, dbCollection, host, port, commandObj, operation);
}

function getSpanAttributes(
  dbName?: string,
  dbCollection?: string,
  host?: undefined | string,
  port?: undefined | string,
  commandObj?: any,
  operation?: string | undefined,
): SpanAttributes {
  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
    // eslint-disable-next-line typescript/no-deprecated
    [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_MONGODB,
    // eslint-disable-next-line typescript/no-deprecated
    [ATTR_DB_NAME]: dbName,
    // eslint-disable-next-line typescript/no-deprecated
    [ATTR_DB_MONGODB_COLLECTION]: dbCollection,
    // eslint-disable-next-line typescript/no-deprecated
    [ATTR_DB_OPERATION]: operation,
    // eslint-disable-next-line typescript/no-deprecated
    [ATTR_DB_CONNECTION_STRING]: `mongodb://${host}:${port}/${dbName}`,
  };

  if (host && port) {
    // eslint-disable-next-line typescript/no-deprecated
    attributes[ATTR_NET_PEER_NAME] = host;
    const portNumber = parseInt(port, 10);
    if (!isNaN(portNumber)) {
      // eslint-disable-next-line typescript/no-deprecated
      attributes[ATTR_NET_PEER_PORT] = portNumber;
    }
  }

  if (commandObj) {
    try {
      // eslint-disable-next-line typescript/no-deprecated
      attributes[ATTR_DB_STATEMENT] = serializeDbStatement(commandObj);
    } catch {
      // ignore serialization errors — the statement is best-effort metadata
    }
  }

  return attributes;
}

export function startMongoSpan(attributes: SpanAttributes): Span {
  return startInactiveSpan({
    // eslint-disable-next-line typescript/no-deprecated
    name: `mongodb.${attributes[ATTR_DB_OPERATION] || 'command'}`,
    kind: SPAN_KIND.CLIENT,
    attributes,
  });
}

/**
 * Wraps the result handler so it ends the span (with error status on failure) and runs the
 * original callback re-activated under the parent span — mongodb loses the async context when
 * it invokes the callback on a later tick.
 */
export function patchEnd(span: Span | undefined, resultHandler: Function): Function {
  const parentSpan = getActiveSpan();
  let spanEnded = false;

  return function patchedEnd(this: {}, ...args: unknown[]) {
    if (!spanEnded) {
      spanEnded = true;
      const error = args[0];
      if (span) {
        if (error instanceof Error) {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: error.message });
        }
        span.end();
      }
    }

    return withActiveSpan(parentSpan ?? null, () => resultHandler.apply(this, args));
  };
}

// The instrumentation only creates spans when there is an active parent span, to avoid emitting
// orphaned mongodb spans.
export function shouldSkipInstrumentation(): boolean {
  return !getActiveSpan();
}
