import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Scope, Span } from '@sentry/core';
import {
  bindScopeToEmitter,
  debug,
  defineIntegration,
  getCurrentScope,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  withScope,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';

// NOTE: this uses the same name as the OTel integration by design.
// When enabled, OTel 'Mysql' integration is omitted from the default set.
const INTEGRATION_NAME = 'Mysql' as const;

// OpenTelemetry "OLD" db/net semantic-conventions. We inline them rather than
// importing `@opentelemetry/semantic-conventions` to keep this integration's
// dependency surface free of OTel — orchestrion's whole point is to step away
// from the OTel auto-instrumentation stack.
//
// We emit the OLD conventions to match `@opentelemetry/instrumentation-mysql`'s
// default (it only emits the stable `db.system.name` / `db.query.text` set when
// `OTEL_SEMCONV_STABILITY_OPT_IN=database` is opted into) and the rest of the
// Sentry JS SDK, whose `inferDbSpanData` processor renames spans based on
// `db.statement`.
const ATTR_DB_SYSTEM = 'db.system';
const ATTR_DB_CONNECTION_STRING = 'db.connection_string';
const ATTR_DB_NAME = 'db.name';
const ATTR_DB_USER = 'db.user';
const ATTR_DB_STATEMENT = 'db.statement';
const ATTR_NET_PEER_NAME = 'net.peer.name';
const ATTR_NET_PEER_PORT = 'net.peer.port';

/**
 * The shape orchestrion's wrapCallback transform attaches to the tracing-channel
 * `context` object. Documented here rather than imported because orchestrion's
 * runtime doesn't export it — see `node_modules/@apm-js-collab/code-transformer/lib/transforms.js`.
 *
 * `arguments` is the *live* args array passed to the wrapped function: orchestrion
 * splices the user's callback out and inserts its own wrapper at the same index
 * before publishing `start`. The `start` hook re-wraps that entry to restore the
 * caller's scope across mysql's async callback dispatch (see below).
 */
interface MysqlQueryChannelContext {
  arguments: unknown[];
  self?: MysqlConnection;
  moduleVersion?: string;
  result?: unknown;
  error?: unknown;
}

interface MysqlConnectionConfig {
  host?: string;
  port?: number | string;
  database?: string;
  user?: string;
  // Pool connections nest the real config one level deeper.
  connectionConfig?: MysqlConnectionConfig;
}

interface MysqlConnection {
  config?: MysqlConnectionConfig;
}

const _mysqlChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      DEBUG_BUILD && debug.log(`[orchestrion:mysql] subscribing to channel "${CHANNELS.MYSQL_QUERY}"`);
      const queryCh = diagnosticsChannel.tracingChannel(CHANNELS.MYSQL_QUERY);

      // Orchestrion creates one `context` object per call, shared across all
      // lifecycle hooks. We key both maps off that identity; `WeakMap` so an
      // unfinished path can't leak its entries.
      const spans = new WeakMap<object, Span>();
      // The scope active when the query was issued, consumed in `end` to bind
      // the streamed `Query` emitter's listeners to it.
      const parentScopes = new WeakMap<object, Scope>();

      // `subscribe()` requires all five lifecycle hooks. The orchestrion
      // `wrapAuto` transform fires events in one of four orders depending on
      // call shape:
      //   - sync throw                            : start → error → end
      //                                            (NO asyncEnd)
      //   - async-callback error                  : start → end → error →
      //                                            asyncStart → asyncEnd
      //   - async-callback success                : start → end → asyncStart →
      //                                            asyncEnd
      //   - no-callback (streamable Query)        : start → end
      //                                            (ctx.result is the Query
      //                                            emitter, no async events)
      //
      // Where the span closes depends on the path: `asyncEnd` for callbacks (so
      // it spans the full round-trip + callback), or `end` for the sync-throw
      // and streamable paths. The `end` hook tells those apart via `ctx.error`
      // / `ctx.result` — see there.
      queryCh.subscribe({
        start(rawCtx) {
          const ctx = rawCtx as MysqlQueryChannelContext;
          const sql = extractSql(ctx.arguments[0]);
          const { host, port, database, user } = getConnectionConfig(ctx.self);
          const portNumber = typeof port === 'string' ? parseInt(port, 10) : port;
          const portIsNumber = typeof portNumber === 'number' && !isNaN(portNumber);

          const span = startInactiveSpan({
            name: sql ?? 'mysql.query',
            op: 'db',
            attributes: {
              [ATTR_DB_SYSTEM]: 'mysql',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.orchestrion.mysql',
              [ATTR_DB_CONNECTION_STRING]: getJDBCString(host, portIsNumber ? portNumber : undefined, database),
              ...(database ? { [ATTR_DB_NAME]: database } : {}),
              ...(user ? { [ATTR_DB_USER]: user } : {}),
              ...(sql ? { [ATTR_DB_STATEMENT]: sql } : {}),
              ...(host ? { [ATTR_NET_PEER_NAME]: host } : {}),
              ...(portIsNumber ? { [ATTR_NET_PEER_PORT]: portNumber } : {}),
            },
          });
          spans.set(rawCtx, span);

          // Capture the scope while we're still synchronously inside the
          // caller's `connection.query` call. mysql v2 drains callbacks and
          // emits streamed-query events from its socket data handler, where the
          // AsyncLocalStorage store backing the active span no longer reflects
          // the caller's context — and `asyncStart`/`asyncEnd` fire from that
          // same lost context, so capturing has to happen now.
          const scope = getCurrentScope();
          parentScopes.set(rawCtx, scope);

          // Callback path: orchestrion has spliced the user's callback out of
          // `ctx.arguments` and put its own wrapper (`__apm$wrappedCb`) at the
          // same index. Re-wrap it so the callback — and any nested
          // `connection.query(...)` — runs with the captured scope active.
          if (ctx.arguments.length > 0) {
            const cbIdx = ctx.arguments.length - 1;
            const orchestrionWrappedCb = ctx.arguments[cbIdx];
            if (typeof orchestrionWrappedCb === 'function') {
              const wrapped = orchestrionWrappedCb as (...a: unknown[]) => unknown;
              ctx.arguments[cbIdx] = function (this: unknown, ...args: unknown[]): unknown {
                return withScope(scope, () => wrapped.apply(this, args));
              };
            }
          }
        },

        end(rawCtx) {
          const ctx = rawCtx as MysqlQueryChannelContext;

          // Sync throw: `end` fires AFTER `error` (both inside the wrapper's
          // `try/catch/finally`), so `ctx.error` is already set. Close the
          // span now since no `asyncEnd` will fire.
          if (ctx.error !== undefined) {
            finishSpan(rawCtx);
            return;
          }

          // No-callback (streamable Query) path: orchestrion's `wrapPromise`
          // stores the synchronous return value on `ctx.result` and never
          // fires `asyncStart`/`asyncEnd`. The returned `Query` is an
          // `EventEmitter` that emits `'end'` on success and `'error'` on
          // failure — hook those to close the span.
          // Note: a streamed span never finishes if the connection is destroyed
          // mid-flight — mysql then emits neither `'end'` nor `'error'`, so the
          // span is dropped (the `WeakMap` still prevents a leak). Closing this
          // needs connection-level hooks the per-query context doesn't expose.
          const result = ctx.result;
          if (result && typeof result === 'object' && hasOnMethod(result)) {
            const span = spans.get(rawCtx);
            if (!span) return;

            // Bind the captured scope to the streamed `Query` emitter: its
            // `'end'`/`'error'`/`'fields'`/… events fire from mysql's socket
            // handler with the caller's context lost, so without this a span
            // started in a user's stream listener would begin a fresh root trace
            // instead of nesting under the parent. `bindScopeToEmitter` patches
            // `on`/`addListener`/… so listeners added after `query()` returns
            // inherit the scope (like OTel's `context.bind`).
            const parentScope = parentScopes.get(rawCtx);
            if (parentScope) {
              bindScopeToEmitter(result, parentScope);
            }

            result.on('error', err => {
              span.setStatus({
                code: SPAN_STATUS_ERROR,
                message: err instanceof Error ? err.message : 'unknown_error',
              });
              setErrorAttributes(span, err);
              // Defensive: end the span here too in case `'end'` never fires
              // (e.g. abrupt socket destruction). `finishSpan` is idempotent —
              // `spans.delete` makes the subsequent `'end'` listener a no-op.
              finishSpan(rawCtx);
            });
            result.on('end', () => finishSpan(rawCtx));
            return;
          }

          // Callback path: `asyncEnd` will close the span. Nothing to do here.
        },

        error(rawCtx) {
          const ctx = rawCtx as MysqlQueryChannelContext;
          const span = spans.get(rawCtx);
          if (!span) return;
          span.setStatus({
            code: SPAN_STATUS_ERROR,
            message: ctx.error instanceof Error ? ctx.error.message : 'unknown_error',
          });
          setErrorAttributes(span, ctx.error);
        },

        asyncStart() {
          // No-op: we end on `asyncEnd` so the span covers the full callback duration.
        },

        asyncEnd(rawCtx) {
          finishSpan(rawCtx);
        },
      });

      function finishSpan(rawCtx: object): void {
        const span = spans.get(rawCtx);
        if (!span) return;
        span.end();
        spans.delete(rawCtx);
        parentScopes.delete(rawCtx);
      }
    },
  };
}) satisfies IntegrationFn;

function hasOnMethod(obj: object): obj is { on: (event: string, listener: (arg?: unknown) => void) => unknown } {
  return 'on' in obj && typeof (obj as { on?: unknown }).on === 'function';
}

// The status message set via `setStatus` is discarded by the OTel->Sentry status mapping in mapStatus.ts (only canonical gRPC strings survive).
// For a refused connection these resolve to e.g. `db.response.status_code: 'ECONNREFUSED'` and `error.type: 'AggregateError'`.
// Mirrors the postgres.js integration.
function setErrorAttributes(span: Span, error: unknown): void {
  const err = error as { code?: string | number; name?: string } | undefined;
  span.setAttribute('db.response.status_code', err?.code !== undefined ? String(err.code) : 'unknown');
  span.setAttribute('error.type', err?.name ?? 'unknown');
}

function extractSql(firstArg: unknown): string | undefined {
  if (typeof firstArg === 'string') {
    return firstArg;
  }
  if (firstArg && typeof firstArg === 'object' && 'sql' in firstArg) {
    const sql = (firstArg as { sql?: unknown }).sql;
    return typeof sql === 'string' ? sql : undefined;
  }
  return undefined;
}

function getConnectionConfig(connection: MysqlConnection | undefined): {
  host?: string;
  port?: number | string;
  database?: string;
  user?: string;
} {
  // Pool connections nest the real config under `.connectionConfig`; single
  // connections expose it directly. Matches `@opentelemetry/instrumentation-mysql`.
  const config = connection?.config?.connectionConfig ?? connection?.config ?? {};
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
  };
}

function getJDBCString(host: string | undefined, port: number | undefined, database: string | undefined): string {
  let s = `jdbc:mysql://${host || 'localhost'}`;
  if (typeof port === 'number') {
    s += `:${port}`;
  }
  if (database) {
    s += `/${database}`;
  }
  return s;
}

/**
 * EXPERIMENTAL — orchestrion-driven mysql integration.
 *
 * Subscribes to the `orchestrion:mysql:query` diagnostics_channel that the
 * orchestrion code transform injects into `mysql/lib/Connection.js`'s
 * `Connection.prototype.query`. Requires the orchestrion runtime hook or
 * bundler plugin to be active — wire that up via `_experimentalSetupOrchestrion`.
 */
export const mysqlChannelIntegration = defineIntegration(_mysqlChannelIntegration);
