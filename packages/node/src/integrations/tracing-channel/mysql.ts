import { tracingChannel } from 'node:diagnostics_channel';
import type { IntegrationFn, Span } from '@sentry/core';
import {
  debug,
  defineIntegration,
  getActiveSpan,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  withActiveSpan,
} from '@sentry/core';
import { addOriginToSpan } from '@sentry/node-core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';

const INTEGRATION_NAME = 'Mysql';

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
 * `arguments` is the *live* args array the wrapper passes to the wrapped function:
 * orchestrion splices the user's callback out and inserts its own wrapper at
 * the same index before publishing `start`. We mutate that last entry again in
 * our `start` hook so the callback (and any nested `connection.query(...)`)
 * runs inside `withActiveSpan(parent, …)` — mysql v2 loses ALS state when it
 * dispatches callbacks from its socket handler, which would otherwise cause
 * nested queries to begin a fresh root trace.
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
      const queryCh = tracingChannel(CHANNELS.MYSQL_QUERY);

      // Each `context` object is shared across start/end/asyncStart/asyncEnd/error
      // for one call (orchestrion creates one per invocation). We key the span
      // off the same identity. WeakMap so we don't leak if a path never reaches
      // asyncEnd for some reason.
      const spans = new WeakMap<object, Span>();

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
      // We end the span on `asyncEnd` for the two callback paths (so the span
      // covers the full network round-trip + callback duration). For the
      // sync-throw path, `end` finishes the span because `ctx.error` is set
      // there. For the streamable no-callback path, `end` finishes by
      // attaching `'end'`/`'error'` listeners to `ctx.result` (the returned
      // `Query` emitter).
      //
      // The discriminator between "end fired before any error" and "end fired
      // after a sync throw" is whether `ctx.error` is set when `end` runs —
      // orchestrion populates it before publishing `error`. The discriminator
      // between callback and no-callback is whether `ctx.result` is set — only
      // the `wrapPromise` (no-callback) path stores it.
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
              [ATTR_DB_CONNECTION_STRING]: getJDBCString(host, portIsNumber ? portNumber : undefined, database),
              ...(database ? { [ATTR_DB_NAME]: database } : {}),
              ...(user ? { [ATTR_DB_USER]: user } : {}),
              ...(sql ? { [ATTR_DB_STATEMENT]: sql } : {}),
              ...(host ? { [ATTR_NET_PEER_NAME]: host } : {}),
              ...(portIsNumber ? { [ATTR_NET_PEER_PORT]: portNumber } : {}),
            },
          });
          addOriginToSpan(span, 'auto.db.orchestrion.mysql');
          spans.set(rawCtx, span);

          // Restore the Sentry/OTel context across mysql's internal callback
          // dispatch. The orchestrion transform has already spliced the user's
          // callback out of `ctx.arguments` and put its own wrapper
          // (`__apm$wrappedCb`) at the same index. mysql v2 drains callbacks
          // from a socket data handler — by the time the response arrives, the
          // AsyncLocalStorage store backing `getActiveSpan()` no longer
          // reflects the caller's context. We re-wrap orchestrion's wrapper so
          // the user's callback (and any nested `connection.query(...)` inside
          // it) runs with the parent span active again.
          //
          // This must happen at `start` (we're synchronously inside the
          // caller's `connection.query` call, so OTel context is still
          // correct). `asyncStart`/`asyncEnd` fire from the same lost context
          // as the callback itself, so they're too late.
          const parentSpan = getActiveSpan();
          if (parentSpan && ctx.arguments.length > 0) {
            const cbIdx = ctx.arguments.length - 1;
            const orchestrionWrappedCb = ctx.arguments[cbIdx];
            if (typeof orchestrionWrappedCb === 'function') {
              const wrapped = orchestrionWrappedCb as (...a: unknown[]) => unknown;
              ctx.arguments[cbIdx] = function (this: unknown, ...args: unknown[]): unknown {
                return withActiveSpan(parentSpan, () => wrapped.apply(this, args));
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
          // TODO: streaming spans aren't finished on `connection.destroy()` —
          // mysql guarantees no further events/callbacks for a destroyed
          // connection, so neither `'end'` nor `'error'` fires and the span
          // never ends (it's dropped, never reported). Closing this gap needs
          // connection-level lifecycle hooks, which the per-query channel
          // context doesn't expose here. The `WeakMap` still prevents a leak.
          const result = ctx.result;
          if (result && typeof result === 'object' && hasOnMethod(result)) {
            const span = spans.get(rawCtx);
            if (!span) return;
            result.on('error', err => {
              span.setStatus({
                code: SPAN_STATUS_ERROR,
                message: err instanceof Error ? err.message : 'unknown_error',
              });
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
      }
    },
  };
}) satisfies IntegrationFn;

function hasOnMethod(obj: object): obj is { on: (event: string, listener: (arg?: unknown) => void) => unknown } {
  return 'on' in obj && typeof (obj as { on?: unknown }).on === 'function';
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
