import {
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  ERROR_TYPE,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import type { Span } from '@sentry/core';
import { debug, SPAN_STATUS_ERROR } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';

// Not part of `@sentry/conventions`, so we keep it inline (matches the OTel
// `PostgresJsInstrumentation`).
const DB_RESPONSE_STATUS_CODE = 'db.response.status_code';

const SQL_OPERATION_REGEX = /^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i;

// Same `Symbol.for()` marker the core `instrumentPostgresJsSql` wrapper sets on
// queries it manually instruments, so we skip them there and never double-span.
export const QUERY_FROM_INSTRUMENTED_SQL = Symbol.for('sentry.query.from.instrumented.sql');
// The query span, stashed on the `Query` so the `execute`/`connect` channels can
// attach connection attributes to it.
export const QUERY_SPAN = Symbol('sentryPostgresJsSpan');
// Set once connection attributes are on the span, so the fallback and the
// `execute`/`connect` channels don't both write them.
const CONNECTION_ATTRS_SET = Symbol('sentryPostgresJsConnectionAttrsSet');
// Set on the channel context once the resolve/reject wrappers have ended the
// span, so `deferSpanEnd` knows the wrappers own the lifecycle.
export const SPAN_ENDED = Symbol('sentryPostgresJsSpanEnded');

/**
 * Connection attributes resolved from postgres.js' parsed options. Port is kept
 * as a string to match the `requestHook` contract of the OTel integration
 * (and the portable `instrumentPostgresJsSql`); it's coerced to a number when
 * set on the span (semantic conventions expect a number for `server.port`).
 */
export interface PostgresConnectionContext {
  ATTR_DB_NAMESPACE?: string;
  ATTR_SERVER_ADDRESS?: string;
  ATTR_SERVER_PORT?: string;
}

/** The `Query` instance postgres.js passes as `self` to `Query.prototype.handle`. */
export interface PostgresQuery {
  strings?: string[];
  executed?: boolean;
  resolve?: (...args: unknown[]) => unknown;
  reject?: (...args: unknown[]) => unknown;
}

export interface PostgresJsQueryContext {
  arguments?: unknown[];
  self?: PostgresQuery;
  result?: unknown;
  error?: unknown;
}

// postgres.js parses `host`/`port` into arrays (it can connect to multiple
// hosts); the `Connection` factory receives this parsed options object.
export interface PostgresParsedOptions {
  host?: string[];
  port?: number[];
  database?: string;
}

// A connection object -> its resolved context, populated on the `connection`
// channel and read on the `execute`/`connect` channels (keyed by the same object).
export const connectionContexts = new WeakMap<object, PostgresConnectionContext>();
// Distinct endpoints seen so far (value-compared, so N connections to one DB
// count once). When exactly one endpoint exists — the common case, and the only
// one the tests exercise — every query resolves to it at handle-start.
const endpointRegistry: PostgresConnectionContext[] = [];

export function registerEndpoint(context: PostgresConnectionContext): void {
  const alreadyKnown = endpointRegistry.some(
    e =>
      e.ATTR_SERVER_ADDRESS === context.ATTR_SERVER_ADDRESS &&
      e.ATTR_SERVER_PORT === context.ATTR_SERVER_PORT &&
      e.ATTR_DB_NAMESPACE === context.ATTR_DB_NAMESPACE,
  );
  if (!alreadyKnown) {
    endpointRegistry.push(context);
  }
}

/** The single known endpoint, or `undefined` when zero or multiple are known. */
export function resolveSingleEndpoint(): PostgresConnectionContext | undefined {
  return endpointRegistry.length === 1 ? endpointRegistry[0] : undefined;
}

export function buildConnectionContext(options: PostgresParsedOptions): PostgresConnectionContext {
  // postgres.js defaults to 'localhost'/5432, but be defensive.
  const host = options.host?.[0] || 'localhost';
  const port = options.port?.[0] || 5432;
  return {
    ATTR_DB_NAMESPACE: typeof options.database === 'string' && options.database !== '' ? options.database : undefined,
    ATTR_SERVER_ADDRESS: host,
    ATTR_SERVER_PORT: String(port),
  };
}

export function setConnectionAttributes(span: Span, query: PostgresQuery, context: PostgresConnectionContext): void {
  const queryRecord = query as Record<symbol, unknown>;
  if (queryRecord[CONNECTION_ATTRS_SET]) {
    return;
  }
  queryRecord[CONNECTION_ATTRS_SET] = true;

  if (context.ATTR_SERVER_ADDRESS) {
    span.setAttribute(SERVER_ADDRESS, context.ATTR_SERVER_ADDRESS);
  }
  if (context.ATTR_SERVER_PORT !== undefined) {
    const port = parseInt(context.ATTR_SERVER_PORT, 10);
    if (!Number.isNaN(port)) {
      span.setAttribute(SERVER_PORT, port);
    }
  }
  if (context.ATTR_DB_NAMESPACE) {
    span.setAttribute(DB_NAMESPACE, context.ATTR_DB_NAMESPACE);
  }
}

/**
 * Backfill connection attributes onto a query's span from a channel whose `self`
 * is the connection object and `arguments[0]` the query. Shared by the `execute`
 * and `connect` channels; both carry that shape and both resolve the context via
 * the `connectionContexts` WeakMap. Idempotent (guarded inside `setConnectionAttributes`).
 */
export function attachConnectionAttributesFromChannel(message: PostgresJsQueryContext): void {
  const connection = message.self as object | undefined;
  const query = message.arguments?.[0] as PostgresQuery | undefined;
  if (!connection || !query) {
    return;
  }
  const span = (query as Record<symbol, unknown>)[QUERY_SPAN] as Span | undefined;
  const context = connectionContexts.get(connection);
  if (span && context) {
    setConnectionAttributes(span, query, context);
  }
}

function setOperationName(span: Span, sanitizedQuery: string | undefined, command?: string): void {
  if (command) {
    span.setAttribute(DB_OPERATION_NAME, command);
    return;
  }
  const operationMatch = sanitizedQuery?.match(SQL_OPERATION_REGEX);
  if (operationMatch?.[1]) {
    span.setAttribute(DB_OPERATION_NAME, operationMatch[1].toUpperCase());
  }
}

/**
 * Wrap `query.resolve`/`query.reject` so the span ends when the query settles.
 *
 * `Query extends Promise` and `async handle()` only dispatches — its promise
 * resolves immediately, long before the query completes. postgres.js signals
 * completion by calling `this.resolve`/`this.reject`, so we own the span end
 * there. Wrapping happens at handle-start because `reject` can fire
 * synchronously during dispatch and `cursor()` reassigns both before executing.
 */
export function wrapQuerySettlement(data: PostgresJsQueryContext, span: Span, sanitizedSqlQuery: string): void {
  const query = data.self;
  if (!query) {
    return;
  }

  // Claim ownership of ending the span up front, so `deferSpanEnd` defers to the
  // wrapper even if `span.end()` below throws.
  const markEnded = (): void => {
    (data as Record<symbol, unknown>)[SPAN_ENDED] = true;
  };

  const originalResolve = query.resolve;
  if (typeof originalResolve === 'function') {
    query.resolve = function (this: unknown, ...resolveArgs: unknown[]): unknown {
      markEnded();
      try {
        const command = (resolveArgs[0] as { command?: string } | undefined)?.command;
        setOperationName(span, sanitizedSqlQuery, command);
        span.end();
      } catch (e) {
        DEBUG_BUILD && debug.error('[orchestrion:postgresjs] error ending span in resolve:', e);
      }
      return originalResolve.apply(this, resolveArgs);
    };
  }

  const originalReject = query.reject;
  if (typeof originalReject === 'function') {
    query.reject = function (this: unknown, ...rejectArgs: unknown[]): unknown {
      markEnded();
      try {
        const err = rejectArgs[0] as { message?: string; code?: string; name?: string } | undefined;
        span.setStatus({ code: SPAN_STATUS_ERROR, message: err?.message || 'unknown_error' });
        span.setAttribute(DB_RESPONSE_STATUS_CODE, err?.code || 'unknown');
        span.setAttribute(ERROR_TYPE, err?.name || 'unknown');
        setOperationName(span, sanitizedSqlQuery);
        span.end();
      } catch (e) {
        DEBUG_BUILD && debug.error('[orchestrion:postgresjs] error ending span in reject:', e);
      }
      return originalReject.apply(this, rejectArgs);
    };
  }
}
