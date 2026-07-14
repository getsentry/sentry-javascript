import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, SpanAttributes } from '@sentry/core';
import {
  defineIntegration,
  isObjectLike,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_KIND,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { subscribeMysql2DiagnosticChannels } from '../../mysql2/mysql2-dc-subscriber';
import type { ChannelName } from '../../orchestrion/channels';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';
import {
  DB_NAME,
  DB_STATEMENT,
  DB_SYSTEM,
  DB_USER,
  NET_PEER_NAME,
  NET_PEER_PORT,
} from '@sentry/conventions/attributes';

const INTEGRATION_NAME = 'Mysql2' as const;
const ORIGIN = 'auto.db.orchestrion.mysql2';
const DB_SYSTEM_VALUE_MYSQL = 'mysql';

/**
 * The shape orchestrion's transform attaches to the tracing-channel `context` object. Documented here
 * rather than imported because orchestrion's runtime doesn't export it.
 */
interface Mysql2QueryChannelContext {
  // The live args array passed to the wrapped `query`/`execute` call: `arguments[0]` is the SQL (a
  // string, `Query`, or `{ sql, values }`), `arguments[1]` is the values array or a callback.
  arguments: unknown[];
  self?: Mysql2Connection;
  result?: unknown;
  error?: unknown;
}

interface Mysql2ConnectionConfig {
  host?: string;
  port?: number | string;
  database?: string;
  user?: string;
  // Pool connections nest the real config one level deeper.
  connectionConfig?: Mysql2ConnectionConfig;
}

interface Mysql2Connection {
  config?: Mysql2ConnectionConfig;
  // mysql2 renders parameterized statements through the connection's own `format` (SqlString.format).
  format?: (sql: string, values?: unknown) => string;
}

/**
 * Orchestrion-driven mysql2 integration.
 *
 * Subscribes to:
 *   - the `orchestrion:mysql2:query`/`:execute` channels the code transform injects into mysql2's
 *     `query`/`execute` (mysql2 `< 3.20.0`), and
 *   - mysql2's native `node:diagnostics_channel` tracing channels (mysql2 `>= 3.20.0`), which the
 *     transform intentionally leaves alone.
 *
 * The two version ranges never overlap, so no query is double-counted. Requires the orchestrion
 * runtime hook or bundler plugin to be active — wire that up via
 * `experimentalUseDiagnosticsChannelInjection`.
 */
function instrumentMysql2(): void {
  // mysql2 >= 3.20.0: native diagnostics_channel path (inert on older versions, which never publish).
  subscribeMysql2DiagnosticChannels(diagnosticsChannel.tracingChannel);

  // mysql2 < 3.20.0: orchestrion-injected channels (inert on >= 3.20.0, which we don't transform).
  subscribeQueryChannel(CHANNELS.MYSQL2_QUERY);
  subscribeQueryChannel(CHANNELS.MYSQL2_EXECUTE);
}

function subscribeQueryChannel(channelName: ChannelName): void {
  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<Mysql2QueryChannelContext>(channelName),
    data => {
      const statement = getQueryText(data.self, data.arguments);

      return startInactiveSpan({
        name: statement ?? 'mysql2.query',
        kind: SPAN_KIND.CLIENT,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db',
          // oxlint-disable-next-line typescript/no-deprecated
          [DB_SYSTEM]: DB_SYSTEM_VALUE_MYSQL,
          ...getConnectionAttributes(data.self?.config),
          // oxlint-disable-next-line typescript/no-deprecated
          ...(statement ? { [DB_STATEMENT]: statement } : {}),
        },
      });
    },
    { requiresParentSpan: true },
  );
}

/**
 * Render the `db.statement` from the wrapped call's arguments, inlining any bind values through the
 * connection's own `format` (as `@opentelemetry/instrumentation-mysql2` does). Returns the raw SQL if
 * formatting isn't possible.
 */
function getQueryText(connection: Mysql2Connection | undefined, args: unknown[]): string | undefined {
  const sql = extractSql(args[0]);
  if (sql === undefined) {
    return undefined;
  }

  // `query(sql, values, cb)` → values is `args[1]`; `query(sql, cb)` → no values.
  const values = Array.isArray(args[1]) ? args[1] : undefined;
  const objectValues =
    isObjectLike(args[0]) && 'values' in args[0] ? (args[0] as { values?: unknown }).values : undefined;
  const boundValues = values ?? objectValues;

  const format = connection?.format;
  if (format && boundValues !== undefined) {
    try {
      return format.call(connection, sql, boundValues);
    } catch {
      return sql;
    }
  }

  return sql;
}

function extractSql(firstArg: unknown): string | undefined {
  if (typeof firstArg === 'string') {
    return firstArg;
  }
  if (isObjectLike(firstArg) && 'sql' in firstArg) {
    const sql = (firstArg as { sql?: unknown }).sql;
    return typeof sql === 'string' ? sql : undefined;
  }
  return undefined;
}

function getConnectionAttributes(config: Mysql2ConnectionConfig | undefined): SpanAttributes {
  // Pool connections nest the real config under `.connectionConfig`; single connections expose it
  // directly. Matches `@opentelemetry/instrumentation-mysql2`.
  const { host, port, database, user } = config?.connectionConfig ?? config ?? {};
  const portNumber = typeof port === 'string' ? parseInt(port, 10) : port;
  const portIsNumber = typeof portNumber === 'number' && !isNaN(portNumber);

  return {
    // oxlint-disable-next-line typescript/no-deprecated
    ...(database ? { [DB_NAME]: database } : {}),
    ...(user ? { [DB_USER]: user } : {}),
    // oxlint-disable-next-line typescript/no-deprecated
    ...(host ? { [NET_PEER_NAME]: host } : {}),
    // oxlint-disable-next-line typescript/no-deprecated
    ...(portIsNumber ? { [NET_PEER_PORT]: portNumber } : {}),
  };
}

const _mysql2ChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19 so do nothing in that case.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      waitForTracingChannelBinding(() => {
        instrumentMysql2();
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Orchestrion-driven mysql2 integration.
 *
 * Adds Sentry tracing instrumentation for the [mysql2](https://www.npmjs.com/package/mysql2) library
 * via diagnostics-channel injection. See {@link instrumentMysql2} for how the two mysql2 version
 * ranges are covered.
 *
 * Known limitation vs. the OTel integration it replaces: the callback-less streaming form
 * (`connection.query(sql).on('result', ...)`) is not traced — see the `mysql2` orchestrion config for
 * why. The callback and promise forms (the common case) are fully instrumented.
 */
export const mysql2ChannelIntegration = defineIntegration(_mysql2ChannelIntegration);
