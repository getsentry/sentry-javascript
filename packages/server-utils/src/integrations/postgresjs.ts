import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import {
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import type { IntegrationFn, Span, SpanAttributes } from '@sentry/core';
import { debug, defineIntegration, startInactiveSpan } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { getSqlQueryAttributes, getSqlSpanName } from '../utils/sql';
import {
  _buildConnectionContext,
  _getConnectionAttributes,
  _reconstructQuery,
  _wrapQuerySettlement,
  type PostgresConnectionContext,
  type PostgresQuerySettlement,
} from './postgresjs-wrapper';
import type { OrchestrionChannelContext } from '../orchestrion/types';
import { CHANNELS } from '../orchestrion/channels';
import { bindTracingChannelToSpan } from '../tracing-channel';
import { postgresJsModuleNames } from '../orchestrion/config/postgres';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';

// Same name as the OTel `PostgresJs` integration by design, so the OTel
// integration of the same name is deduplicated out of the default set.
const INTEGRATION_NAME = 'PostgresJs' as const;

const ORIGIN = 'auto.db.postgresjs';

const DB_SYSTEM_NAME_POSTGRES = 'postgres';

const NOOP = (): void => {};

// Same `Symbol.for()` marker the core `instrumentPostgresJsSql` wrapper sets on
// queries it manually instruments, so we skip them there and never double-span.
const QUERY_FROM_INSTRUMENTED_SQL = Symbol.for('sentry.query.from.instrumented.sql');
// The query span, stashed on the `Query` so the `execute`/`connect` channels can
// attach connection attributes to it.
const QUERY_SPAN = Symbol('sentryPostgresJsSpan');
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
interface PostgresQuery extends PostgresQuerySettlement {
  strings?: string[];
  executed?: boolean;
}

interface PostgresJsQueryContext extends OrchestrionChannelContext {
  self?: PostgresQuery;
  [SPAN_ENDED]?: boolean;
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
  const context = _buildConnectionContext(options);
  connectionContexts.set(connection, context);
  registerEndpoint(context);
}

/**
 * Backfill connection attributes onto a query's span from a channel whose `self`
 * is the connection object and `arguments[0]` the query. Shared by the `execute`
 * and `connect` channels; both carry that shape and both resolve the context via
 * the `connectionContexts` WeakMap.
 */
function attachConnectionAttributesFromChannel(message: PostgresJsQueryContext): void {
  const connection = message.self;
  const query = message.arguments?.[0] as PostgresQuery | undefined;
  if (!connection || !query) {
    return;
  }
  const span = (query as Record<symbol, unknown>)[QUERY_SPAN] as Span | undefined;
  const context = connectionContexts.get(connection);
  if (span && context) {
    span.setAttributes(_getConnectionAttributes(context));
  }
}

const _postgresJsIntegration = ((options: PostgresJsIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, postgresJsModuleNames, instrumentPostgresJs, [options]);
    },
  };
}) satisfies IntegrationFn;

function instrumentPostgresJs(options: PostgresJsIntegrationOptions): void {
  const { requireParentSpan, requestHook } = options;

  // Connection + execute are pure observers (no span, no async binding).
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

  bindTracingChannelToSpan<PostgresJsQueryContext>(
    diagnosticsChannel.tracingChannel<PostgresJsQueryContext>(CHANNELS.POSTGRESJS_HANDLE),
    data => {
      const query = data.self;
      if (!query) {
        return undefined;
      }

      // Opt out of re-entrant `handle()` calls (then/catch/finally re-invoke
      // it, guarded by `executed`) and queries already wrapped by the portable
      // `instrumentPostgresJsSql`.
      if (query.executed === true || (query as Record<symbol, unknown>)[QUERY_FROM_INSTRUMENTED_SQL]) {
        return undefined;
      }

      const queryAttributes = getSqlQueryAttributes(_reconstructQuery(query.strings));

      // Single-endpoint fallback: resolve context now so the span name and `requestHook` have
      // it, and the first-query-per-connection (bare `execute`) path still gets attrs.
      const context = resolveSingleEndpoint();

      // `sentry.kind: client` matches the mysql/pg channel subscribers.
      const attributes: SpanAttributes = {
        [SENTRY_OP]: DB,
        [SENTRY_KIND]: 'client',
        [SENTRY_ORIGIN]: ORIGIN,
        [DB_SYSTEM_NAME]: DB_SYSTEM_NAME_POSTGRES,
        ...queryAttributes,
        ...(context && _getConnectionAttributes(context)),
      };
      const span = startInactiveSpan({
        name: getSqlSpanName(attributes, 'postgresjs.query'),
        onlyIfParent: requireParentSpan !== false,
        attributes,
      });

      // Stash for the `execute`/`connect` channels to attach per-connection attributes.
      (query as Record<symbol, unknown>)[QUERY_SPAN] = span;

      if (requestHook) {
        try {
          requestHook(span, queryAttributes[DB_QUERY_TEXT] ?? '', context);
        } catch (e) {
          span.setAttribute('sentry.hook.error', 'requestHook failed');
          DEBUG_BUILD && debug.error('[instrumentation:postgresjs] error in requestHook:', e);
        }
      }

      // Claim ownership of ending the span up front, so `deferSpanEnd` defers to the
      // settlement wrappers even if `span.end()` throws in them.
      _wrapQuerySettlement(query, span, queryAttributes[DB_OPERATION_NAME], () => {
        data[SPAN_ENDED] = true;
      });

      return span;
    },
    {
      deferSpanEnd({ data }) {
        // `handle` is async: its promise settles on dispatch (asyncEnd), long
        // before the query does, so the resolve/reject wrappers own the ending.
        // The helper only ends the span if `handle()` itself threw.
        // NOTE: for a cursor consumed as an async iterator, only the first batch
        // reaches `handle` (the `executed` guard blocks the rest), so the span
        // ends on the first batch — a pre-existing flaw kept for parity.
        return !!data[SPAN_ENDED] || !('error' in data);
      },
    },
  );
}

/**
 * Diagnostics-channel-based postgres.js (`postgres` v3.x) integration.
 *
 * Subscribes to the `orchestrion:postgres:handle` / `:connection` / `:execute` /
 * `:connect` diagnostics channels injected into postgres.js' `Query.prototype.handle`
 * and `Connection`/`execute`/`connect` (in `src/*` and `cjs/src/*`) and creates db
 * spans matching the OTel `postgresJsIntegration`. Requires the Sentry runtime
 * hook or bundler plugin.
 */
export const postgresJsIntegration = defineIntegration(_postgresJsIntegration);
