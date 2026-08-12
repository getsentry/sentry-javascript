import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, SpanAttributes } from '@sentry/core';
import {
  defineIntegration,
  isObjectLike,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { subscribeMysql2DiagnosticChannels } from '../mysql2/mysql2-dc-subscriber';
import type { ChannelName } from '../orchestrion/channels';
import { CHANNELS } from '../orchestrion/channels';
import { bindTracingChannelToSpan } from '../tracing-channel';
import { mysql2ModuleNames } from '../orchestrion/config/mysql2';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import {
  DB_NAME,
  DB_STATEMENT,
  DB_SYSTEM,
  DB_USER,
  SERVER_ADDRESS,
  SERVER_PORT,
  SENTRY_KIND,
} from '@sentry/conventions/attributes';

const INTEGRATION_NAME = 'Mysql2' as const;
const ORIGIN = 'auto.db.mysql2';
const DB_SYSTEM_VALUE_MYSQL = 'mysql';

/**
 * The shape orchestrion's transform attaches to the tracing-channel `context`
 * object. Documented here rather than imported because orchestrion's runtime
 * doesn't export it.
 */
interface Mysql2QueryChannelContext {
  // The live args array passed to the wrapped `query`/`execute` call:
  // `arguments[0]` is the SQL (a string, `Query`, or `{ sql, values }`),
  // `arguments[1]` is the values array or a callback.
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
}

/**
 * Orchestrion-driven mysql2 integration.
 *
 * Subscribes to:
 *   - the `orchestrion:mysql2:query`/`:execute` channels the code transform
 *     injects into mysql2's `query`/`execute` (mysql2 `< 3.20.0`), and
 *   - mysql2's native `node:diagnostics_channel` tracing channels
 *     (mysql2 `>= 3.20.0`), which the transform intentionally leaves alone.
 *
 * The two version ranges never overlap, so no query is double-counted. Requires the orchestrion
 * runtime hook or bundler plugin to be active.
 */
function instrumentMysql2Orchestrion(): void {
  subscribeQueryChannel(CHANNELS.MYSQL2_QUERY);
  subscribeQueryChannel(CHANNELS.MYSQL2_EXECUTE);
}

function subscribeQueryChannel(channelName: ChannelName): void {
  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<Mysql2QueryChannelContext>(channelName),
    data => {
      const statement = getQueryText(data.arguments);

      return startInactiveSpan({
        name: statement ?? 'mysql2.query',
        attributes: {
          [SENTRY_KIND]: 'client',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db',
          // oxlint-disable-next-line typescript/no-deprecated
          [DB_SYSTEM]: DB_SYSTEM_VALUE_MYSQL,
          ...getConnectionAttributes(data.self?.config),
          // oxlint-disable-next-line typescript/no-deprecated
          [DB_STATEMENT]: statement || undefined,
        },
      });
    },
    { requiresParentSpan: true },
  );
}

/**
 * Render the `db.statement` from the wrapped call's first argument.
 */
function getQueryText(args: unknown[]): string | undefined {
  return extractSql(args[0]);
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
  // Pool connections nest the real config under `.connectionConfig`; single
  // connections expose it directly.
  const { host, port, database, user } = config?.connectionConfig ?? config ?? {};
  const portNumber = typeof port === 'string' ? parseInt(port, 10) : port;
  const portIsNumber = typeof portNumber === 'number' && !isNaN(portNumber);

  return {
    // oxlint-disable-next-line typescript/no-deprecated
    [DB_NAME]: database || undefined,
    [DB_USER]: user || undefined,
    // oxlint-disable-next-line typescript/no-deprecated
    [SERVER_ADDRESS]: host || undefined,
    // oxlint-disable-next-line typescript/no-deprecated
    [SERVER_PORT]: portIsNumber ? portNumber : undefined,
  };
}

const _mysql2Integration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // mysql2 >= 3.20.0 native diagnostics_channel path: subscribe eagerly,
      // because they do not get an orchestrion event to indicate readiness
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }
      waitForTracingChannelBinding(() => {
        subscribeMysql2DiagnosticChannels(diagnosticsChannel.tracingChannel);
      });
    },
    setup(client) {
      // mysql2 < 3.20.0 orchestrion channels, subscribe lazily
      invokeOrchestrionInstrumentation(client, mysql2ModuleNames, instrumentMysql2Orchestrion, []);
    },
  };
}) satisfies IntegrationFn;

/**
 * Orchestrion-driven mysql2 integration.
 *
 * Adds Sentry tracing instrumentation for the
 * [mysql2](https://www.npmjs.com/package/mysql2) library via diagnostics-channel
 * injection. See {@link instrumentMysql2} for how the two mysql2 version ranges
 * are covered.
 *
 * Known limitation vs. older OTel integration it replaced: the callback-less
 * streaming form (`connection.query(sql).on('result', ...)`) is not traced.
 * See the `mysql2` orchestrion config for why. The callback and promise forms
 * (the common case) are fully instrumented.
 */
export const mysql2Integration = defineIntegration(_mysql2Integration);
