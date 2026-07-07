import * as diagnosticsChannel from 'node:diagnostics_channel';
import { DB_QUERY_TEXT, DB_SYSTEM_NAME } from '@sentry/conventions/attributes';
import type { IntegrationFn, PostgresConnectionContext, Span } from '@sentry/core';
import {
  _INTERNAL_reconstructPostgresQuery,
  _INTERNAL_sanitizeSqlQuery,
  debug,
  defineIntegration,
  getActiveSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_KIND,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../../debug-build';
import { CHANNELS } from '../../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../../tracing-channel';
import type { PostgresJsQueryContext } from './types';
import {
  attachConnectionAttributesFromChannel,
  QUERY_FROM_INSTRUMENTED_SQL,
  QUERY_SPAN,
  recordConnectionFromChannel,
  resolveSingleEndpoint,
  setConnectionAttributes,
  SPAN_ENDED,
  wrapQuerySettlement,
} from './utils';

// Same name as the OTel `PostgresJs` integration by design: when this is
// enabled, the OTel integration of the same name is dropped from the default
// set (see `experimentalUseDiagnosticsChannelInjection`).
const INTEGRATION_NAME = 'PostgresJs' as const;

const ORIGIN = 'auto.db.orchestrion.postgresjs';

const NOOP = (): void => {};

export interface PostgresJsChannelIntegrationOptions {
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

const _postgresJsChannelIntegration = ((options: PostgresJsChannelIntegrationOptions = {}) => {
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

            // Opt out of: re-entrant `handle()` calls (then/catch/finally re-invoke
            // it, guarded by `executed`), queries already wrapped by the portable
            // `instrumentPostgresJsSql`, and (by default) queries with no parent span.
            if (query.executed === true || (query as Record<symbol, unknown>)[QUERY_FROM_INSTRUMENTED_SQL]) {
              return undefined;
            }
            if (requireParentSpan !== false && !getActiveSpan()) {
              return undefined;
            }

            const fullQuery = _INTERNAL_reconstructPostgresQuery(query.strings);
            const sanitizedSqlQuery = _INTERNAL_sanitizeSqlQuery(fullQuery);

            // `kind: CLIENT` matches the mysql/pg channel subscribers.
            const span = startInactiveSpan({
              name: sanitizedSqlQuery || 'postgresjs.query',
              op: 'db',
              kind: SPAN_KIND.CLIENT,
              attributes: {
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
 * EXPERIMENTAL — orchestrion-driven postgres.js (`postgres` v3.x) integration.
 *
 * Subscribes to the `orchestrion:postgres:handle` / `:connection` / `:execute` /
 * `:connect` diagnostics channels injected into postgres.js' `Query.prototype.handle`
 * and `Connection`/`execute`/`connect` (in `src/*` and `cjs/src/*`) and creates db
 * spans matching the OTel `postgresJsIntegration`. Requires the orchestrion runtime
 * hook or bundler plugin.
 */
export const postgresJsChannelIntegration = defineIntegration(_postgresJsChannelIntegration);
