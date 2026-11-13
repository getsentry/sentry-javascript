import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import {
  DB_COLLECTION_NAME,
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_QUERY_SUMMARY,
  DB_SYSTEM_NAME,
  DB_USER,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import type { IntegrationFn, SpanAttributes } from '@sentry/core';
import { defineIntegration, startInactiveSpan } from '@sentry/core';
import type { OrchestrionChannelContext } from '../orchestrion/types';
import { CHANNELS } from '../orchestrion/channels';
import { clickhouseModuleNames } from '../orchestrion/config/clickhouse';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import { bindTracingChannelToSpan } from '../tracing-channel';
import { getLowCardinalitySqlSpanName, getSqlQueryAttributes } from '../utils/sql';

const INTEGRATION_NAME = 'ClickHouse' as const;
const ORIGIN = 'auto.db.clickhouse';
const DB_SYSTEM_CLICKHOUSE = 'clickhouse';

type ClickHouseMethod = 'query' | 'command' | 'exec' | 'insert';

// The parts of `ClickHouseClient`'s `connectionParams` the span reads. `>=1.10` moved the username
// into `auth` (which can hold an access token instead); older versions keep it at the top level.
interface ClickHouseConnectionParams {
  url?: URL;
  database?: string;
  username?: string;
  auth?: { username?: string };
}

interface ClickHouseClient {
  connectionParams?: ClickHouseConnectionParams;
}

// `query`/`command`/`exec` take `{ query }`, `insert` takes `{ table, values }`. Every method accepts a
// per-call `auth` override.
interface ClickHouseParams {
  query?: unknown;
  table?: unknown;
  values?: unknown;
  auth?: { username?: unknown };
}

/** Context orchestrion attaches to the channels wrapping `ClickHouseClient`'s methods. */
interface ClickHouseChannelContext extends OrchestrionChannelContext {
  arguments: [ClickHouseParams?, ...unknown[]];
  self?: ClickHouseClient;
}

const _clickhouseIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, clickhouseModuleNames, instrumentClickhouse, []);
    },
  };
}) satisfies IntegrationFn;

function instrumentClickhouse(): void {
  // `@clickhouse/client-common` (`<1.23.0`) and `@clickhouse/client` (`>=1.23.0`) publish the same
  // calls under their own module names.
  const channels: [string, ClickHouseMethod][] = [
    [CHANNELS.CLICKHOUSE_QUERY, 'query'],
    [CHANNELS.CLICKHOUSE_COMMAND, 'command'],
    [CHANNELS.CLICKHOUSE_EXEC, 'exec'],
    [CHANNELS.CLICKHOUSE_INSERT, 'insert'],
    [CHANNELS.CLICKHOUSE_COMMON_QUERY, 'query'],
    [CHANNELS.CLICKHOUSE_COMMON_COMMAND, 'command'],
    [CHANNELS.CLICKHOUSE_COMMON_EXEC, 'exec'],
    [CHANNELS.CLICKHOUSE_COMMON_INSERT, 'insert'],
  ];

  for (const [channelName, method] of channels) {
    // Failed calls only get an error status on the span. The error still rejects to the caller, who
    // decides whether to handle it, so it isn't captured here.
    bindTracingChannelToSpan(diagnosticsChannel.tracingChannel<ClickHouseChannelContext>(channelName), data => {
      const params = data.arguments[0];
      // `insert` with an empty array returns without sending a request.
      if (method === 'insert' && Array.isArray(params?.values) && params.values.length === 0) {
        return undefined;
      }

      const attributes: SpanAttributes = {
        [SENTRY_OP]: DB,
        [SENTRY_KIND]: 'client',
        [SENTRY_ORIGIN]: ORIGIN,
        ...getConnectionAttributes(data.self?.connectionParams, params),
        ...(method === 'insert' ? getInsertAttributes(params) : getStatementAttributes(params)),
      };

      return startInactiveSpan({
        name: getLowCardinalitySqlSpanName(attributes, DB_SYSTEM_CLICKHOUSE),
        attributes,
        onlyIfParent: true,
      });
    });
  }
}

function getStatementAttributes(params: ClickHouseParams | undefined): SpanAttributes {
  const query = params?.query;
  return { ...getSqlQueryAttributes(typeof query === 'string' ? query : undefined, 'clickhouse') };
}

// `insert` builds its `INSERT INTO <table> FORMAT <format>` statement internally, so the span is
// described from the target table instead of a statement.
function getInsertAttributes(params: ClickHouseParams | undefined): SpanAttributes {
  const table = typeof params?.table === 'string' && params.table ? params.table : undefined;
  return {
    [DB_OPERATION_NAME]: 'INSERT',
    [DB_COLLECTION_NAME]: table,
    [DB_QUERY_SUMMARY]: table ? `INSERT ${table}` : 'INSERT',
  };
}

function getConnectionAttributes(
  connectionParams: ClickHouseConnectionParams | undefined,
  params: ClickHouseParams | undefined,
): SpanAttributes {
  const url = connectionParams?.url;
  const user = params?.auth?.username ?? connectionParams?.auth?.username ?? connectionParams?.username;
  return {
    [DB_SYSTEM_NAME]: DB_SYSTEM_CLICKHOUSE,
    [DB_NAMESPACE]: connectionParams?.database,
    [DB_USER]: typeof user === 'string' ? user : undefined,
    [SERVER_ADDRESS]: url?.hostname || undefined,
    [SERVER_PORT]: url ? getServerPort(url) : undefined,
  };
}

// The client talks HTTP(S), so a URL without an explicit port uses the protocol's default.
function getServerPort(url: URL): number {
  if (url.port) {
    return Number(url.port);
  }
  return url.protocol === 'https:' ? 443 : 80;
}

/**
 * Diagnostics-channel-based `@clickhouse/client` integration.
 *
 * Subscribes to the channels Sentry's code transform injects into `ClickHouseClient`'s `query`,
 * `command`, `exec` and `insert` methods, and emits a `db` span for each call. Requires the Sentry
 * runtime hook or bundler plugin to be active.
 */
export const clickhouseIntegration = defineIntegration(_clickhouseIntegration);
