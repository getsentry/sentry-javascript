import { tracingChannel } from 'node:diagnostics_channel';
import type { IntegrationFn, Span } from '@sentry/core';
import { debug, defineIntegration, SPAN_STATUS_ERROR, startInactiveSpan } from '@sentry/core';
import { addOriginToSpan } from '@sentry/node-core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';

const INTEGRATION_NAME = 'Mysql';

// OpenTelemetry semantic-conventions strings. We inline them rather than
// importing `@opentelemetry/semantic-conventions` to keep this integration's
// dependency surface free of OTel — orchestrion's whole point is to step away
// from the OTel auto-instrumentation stack.
const ATTR_DB_SYSTEM_NAME = 'db.system.name';
const ATTR_DB_QUERY_TEXT = 'db.query.text';
const ATTR_DB_OPERATION_NAME = 'db.operation.name';

const SQL_OPERATION_REGEX =
  /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|REPLACE|MERGE|CALL|SHOW|USE|BEGIN|COMMIT|ROLLBACK)\b/i;

/**
 * The shape orchestrion's wrapCallback transform attaches to the tracing-channel
 * `context` object. Documented here rather than imported because orchestrion's
 * runtime doesn't export it — see `node_modules/@apm-js-collab/code-transformer/lib/transforms.js`.
 */
interface MysqlQueryChannelContext {
  arguments: unknown[];
  self?: unknown;
  moduleVersion?: string;
  result?: unknown;
  error?: unknown;
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

      // `subscribe()` requires all five lifecycle hooks. For callback-style mysql:
      //   - `start`           — synchronous entry to `Connection.query`. Start span here.
      //   - `end`             — synchronous return from `Connection.query` (BEFORE the
      //                         network round-trip completes). Not the right span end.
      //   - `error`           — the query callback fired with an error.
      //   - `asyncStart`      — about to invoke the user callback (query result is ready).
      //   - `asyncEnd`        — user callback returned. This is the moment we want to
      //                         end the span — it captures the full query latency.
      queryCh.subscribe({
        start(rawCtx) {
          const ctx = rawCtx as MysqlQueryChannelContext;
          const sql = extractSql(ctx.arguments[0]);
          const operation = sql ? extractOperation(sql) : undefined;

          const span = startInactiveSpan({
            name: sql ?? 'mysql.query',
            op: 'db',
            attributes: {
              [ATTR_DB_SYSTEM_NAME]: 'mysql',
              ...(sql ? { [ATTR_DB_QUERY_TEXT]: sql } : {}),
              ...(operation ? { [ATTR_DB_OPERATION_NAME]: operation } : {}),
            },
          });
          addOriginToSpan(span, 'auto.db.orchestrion.mysql');
          spans.set(rawCtx, span);
        },

        end() {
          // No-op: span ends in `asyncEnd` once the network round-trip completes.
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
          const span = spans.get(rawCtx);
          if (!span) return;
          span.end();
          spans.delete(rawCtx);
        },
      });
    },
  };
}) satisfies IntegrationFn;

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

function extractOperation(sql: string): string | undefined {
  const match = sql.match(SQL_OPERATION_REGEX);
  return match?.[1]?.toUpperCase();
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
