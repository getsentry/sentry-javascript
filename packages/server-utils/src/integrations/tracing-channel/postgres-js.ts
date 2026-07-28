import * as diagnosticsChannel from 'node:diagnostics_channel';
import { DB_QUERY_TEXT, DB_SYSTEM_NAME, ERROR_TYPE, SENTRY_KIND } from '@sentry/conventions/attributes';
import type { IntegrationFn, PostgresConnectionContext, Span } from '@sentry/core';
import {
  _INTERNAL_buildPostgresConnectionContext,
  _INTERNAL_reconstructPostgresQuery,
  _INTERNAL_sanitizeSqlQuery,
  _INTERNAL_setPostgresConnectionAttributes,
  _INTERNAL_setPostgresOperationName,
  debug,
  defineIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// Same name as the OTel `PostgresJs` integration by design, so the OTel
// integration of the same name is deduplicated out of the default set.
const INTEGRATION_NAME = 'PostgresJs' as const;

const ORIGIN = 'auto.db.orchestrion.postgresjs';

// Not part of `@sentry/conventions`, so we keep it inline (matches the OTel `PostgresJsInstrumentation`).
const DB_RESPONSE_STATUS_CODE = 'db.response.status_code';

const NOOP = (): void => {};

// Same `Symbol.for()` marker the core `instrumentPostgresJsSql` wrapper sets on
// queries it manually instruments, so we skip them there and never double-span.
const QUERY_FROM_INSTRUMENTED_SQL = Symbol.for('sentry.query.from.instrumented.sql');
// The query span, stashed on the `Query` so the `execute`/`connect` channels can
// attach connection attributes to it.
const QUERY_SPAN = Symbol('sentryPostgresJsSpan');
// Set once connection attributes are on the span, so the fallback and the
// `execute`/`connect` channels don't both write them.
const CONNECTION_ATTRS_SET = Symbol('sentryPostgresJsConnectionAttrsSet');
// Set on the channel context once the resolve/reject wrappers have ended the
// span, so `deferSpanEnd` knows the wrappers own the lifecycle.
const SPAN_ENDED = Symbol('sentryPostgresJsSpanEnded');

export interface PostgresJsIntegrationOptions {
  /**
   * Only create spans when there's already an active parent span. Defaults to
   * `true`, matching the OTel `postgresJsIntegration`.
   */
  requireParentSpan?: boolean;
  /**
   * Hook to modify the query span before the query runs. Receives the span, the
   * sanitized SQL, and (when resolvable) the connection context.
   */
  requestHook?: (span: Span, sanitizedSqlQuery: string, postgresConnectionContext?: PostgresConnectionContext) => void;
}

/** The `Query` instance postgres.js passes as `self` to `Query.prototype.handle`. */
interface PostgresQuery {
  strings?: string[];
  executed?: boolean;
  resolve?: (...args: unknown[]) => unknown;
  reject?: (...args: unknown[]) => unknown;
}

interface PostgresJsQueryContext {
  arguments?: unknown[];
  self?: PostgresQuery;
  result?: unknown;
  error?: unknown;
}

// A connection object -> its resolved context, populated on the `connection`
// channel and read on the `execute`/`connect` channels (keyed by the same object).
const connectionContexts = new WeakMap<object, PostgresConnectionContext>();
// Distinct endpoints seen so far (value-compared, so N connections to one DB
// count once). When exactly one endpoint exists — the common case, and the only
// one the tests exercise — every query resolves to it at handle-start.
const endpointRegistry: PostgresConnectionContext[] = [];

function registerEndpoint(context: PostgresConnectionContext): void {
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
function resolveSingleEndpoint(): PostgresConnectionContext | undefined {
  return endpointRegistry.length === 1 ? endpointRegistry[0] : undefined;
}

/**
 * Record a connection from the `connection` channel `end` (`result` is the
 * connection object, `arguments[0]` the parsed options), keying its resolved
 * context by the connection object and tracking its endpoint.
 */
function recordConnectionFromChannel(message: PostgresJsQueryContext): void {
  const connection = message.result;
  const options = message.arguments?.[0] as { host?: string[]; port?: number[]; database?: string } | undefined;
  if (!connection || typeof connection !== 'object' || !options) {
    return;
  }
  const context = _INTERNAL_buildPostgresConnectionContext(options);
  connectionContexts.set(connection, context);
  registerEndpoint(context);
}

function setConnectionAttributes(span: Span, query: PostgresQuery, context: PostgresConnectionContext): void {
  const queryRecord = query as Record<symbol, unknown>;
  if (queryRecord[CONNECTION_ATTRS_SET]) {
    return;
  }
  queryRecord[CONNECTION_ATTRS_SET] = true;
  _INTERNAL_setPostgresConnectionAttributes(span, context);
}

/**
 * Backfill connection attributes onto a query's span from a channel whose `self`
 * is the connection object and `arguments[0]` the query. Shared by the `execute`
 * and `connect` channels; both carry that shape and both resolve the context via
 * the `connectionContexts` WeakMap. Idempotent (guarded inside `setConnectionAttributes`).
 */
function attachConnectionAttributesFromChannel(message: PostgresJsQueryContext): void {
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

/**
 * Wrap `query.resolve`/`query.reject` so the span ends when the query settles.
 *
 * `Query extends Promise` and `async handle()` only dispatches — its promise
 * resolves immediately, long before the query completes. postgres.js signals
 * completion by calling `this.resolve`/`this.reject`, so we own the span end
 * there. Wrapping happens at handle-start because `reject` can fire
 * synchronously during dispatch and `cursor()` reassigns both before executing.
 */
function wrapQuerySettlement(data: PostgresJsQueryContext, span: Span, sanitizedSqlQuery: string): void {
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
        _INTERNAL_setPostgresOperationName(span, sanitizedSqlQuery, command);
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
        _INTERNAL_setPostgresOperationName(span, sanitizedSqlQuery);
        span.end();
      } catch (e) {
        DEBUG_BUILD && debug.error('[orchestrion:postgresjs] error ending span in reject:', e);
      }
      return originalReject.apply(this, rejectArgs);
    };
  }
}

const _postgresJsIntegration = ((options: PostgresJsIntegrationOptions = {}) => {
  const { requireParentSpan, requestHook } = options;

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      DEBUG_BUILD && debug.log(`[orchestrion:postgresjs] subscribing to "${CHANNELS.POSTGRESJS_HANDLE}"`);

      // Connection + execute are pure observers (no span, no async binding), so
      // subscribe immediately — factory-time `Connection()` calls happen before
      // `waitForTracingChannelBinding` resolves and must still be recorded.
      diagnosticsChannel.tracingChannel<PostgresJsQueryContext>(CHANNELS.POSTGRESJS_CONNECTION).subscribe({
        start: NOOP,
        asyncStart: NOOP,
        asyncEnd: NOOP,
        error: NOOP,
        end: recordConnectionFromChannel,
      });

      // Per-connection attributes for queries reusing an already-open connection
      // (`c.execute(q)`, `self === c`). `execute` is also called bare
      // (`self === undefined`) for the first query on each connection, `fetchState`
      // and `retry`; those miss here (the `connect` channel below covers the first
      // user query, and the single-endpoint fallback covers the common case).
      diagnosticsChannel.tracingChannel<PostgresJsQueryContext>(CHANNELS.POSTGRESJS_EXECUTE).subscribe({
        end: NOOP,
        asyncStart: NOOP,
        asyncEnd: NOOP,
        error: NOOP,
        start: attachConnectionAttributesFromChannel,
      });

      // The connection's `connect(query)` method (`self === c`, `arguments[0]` the
      // query) fires when a fresh connection is opened for a query. That first query
      // is later dispatched via a bare `execute` (no `self`), so this is where it
      // gets its connection attributes in multi-endpoint apps.
      diagnosticsChannel.tracingChannel<PostgresJsQueryContext>(CHANNELS.POSTGRESJS_CONNECT).subscribe({
        end: NOOP,
        asyncStart: NOOP,
        asyncEnd: NOOP,
        error: NOOP,
        start: attachConnectionAttributesFromChannel,
      });

      // The span-creating `handle` subscription needs the async-context binding
      // that `initOpenTelemetry()` registers after integration setup.
      waitForTracingChannelBinding(() => {
        bindTracingChannelToSpan<PostgresJsQueryContext>(
          diagnosticsChannel.tracingChannel<PostgresJsQueryContext>(CHANNELS.POSTGRESJS_HANDLE),
          data => {
            const query = data.self;
            if (!query) {
              return undefined;
            }

            // Opt out of re-entrant `handle()` calls (then/catch/finally re-invoke it, guarded by
            // `executed`) and queries already wrapped by the portable `instrumentPostgresJsSql`. The
            // parent-span requirement is applied via `requiresParentSpan` below.
            if (query.executed === true || (query as Record<symbol, unknown>)[QUERY_FROM_INSTRUMENTED_SQL]) {
              return undefined;
            }

            const fullQuery = _INTERNAL_reconstructPostgresQuery(query.strings);
            const sanitizedSqlQuery = _INTERNAL_sanitizeSqlQuery(fullQuery);

            // `sentry.kind: 'client'` matches the mysql/pg channel subscribers.
            const span = startInactiveSpan({
              name: sanitizedSqlQuery || 'postgresjs.query',
              op: 'db',
              attributes: {
                [SENTRY_KIND]: 'client',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
                [DB_SYSTEM_NAME]: 'postgres',
                [DB_QUERY_TEXT]: sanitizedSqlQuery,
              },
            });

            // Stash for the `execute`/`connect` channels to attach per-connection attributes.
            (query as Record<symbol, unknown>)[QUERY_SPAN] = span;

            // Single-endpoint fallback: resolve context now so `requestHook` has it
            // and the first-query-per-connection (bare `execute`) path still gets attrs.
            const context = resolveSingleEndpoint();
            if (context) {
              setConnectionAttributes(span, query, context);
            }

            if (requestHook) {
              try {
                requestHook(span, sanitizedSqlQuery, context);
              } catch (e) {
                span.setAttribute('sentry.hook.error', 'requestHook failed');
                DEBUG_BUILD && debug.error('[orchestrion:postgresjs] error in requestHook:', e);
              }
            }

            wrapQuerySettlement(data, span, sanitizedSqlQuery);

            return span;
          },
          {
            requiresParentSpan: requireParentSpan !== false,
            deferSpanEnd({ data }) {
              // `handle` is async: its promise settles on dispatch (asyncEnd), long
              // before the query does. The resolve/reject wrappers own the ending.
              if ((data as Record<symbol, unknown>)[SPAN_ENDED]) {
                return true; // wrappers already ended it
              }
              if ('error' in data) {
                return false; // `handle()` itself threw; the error subscriber annotated the span, let the helper end it
              }
              // NOTE: for a cursor consumed as an async iterator, only the first batch
              // reaches `handle` (the `executed` guard blocks the rest), so the span
              // ends on the first batch — a pre-existing flaw kept for parity.
              return true; // query in flight; the wrappers will end the span when it settles
            },
          },
        );
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Orchestrion-driven postgres.js (`postgres` v3.x) integration.
 *
 * Subscribes to the `orchestrion:postgres:handle` / `:connection` / `:execute` /
 * `:connect` diagnostics channels injected into postgres.js' `Query.prototype.handle`
 * and `Connection`/`execute`/`connect` (in `src/*` and `cjs/src/*`) and creates db
 * spans matching the OTel `postgresJsIntegration`. Requires the orchestrion runtime
 * hook or bundler plugin.
 */
export const postgresJsIntegration = defineIntegration(_postgresJsIntegration);
