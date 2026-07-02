import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Scope, SpanAttributes } from '@sentry/core';
import {
  bindScopeToEmitter,
  debug,
  defineIntegration,
  getActiveSpan,
  getCurrentScope,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// NOTE: this uses the same name as the OTel integration by design.
// When enabled, the OTel 'Postgres' integration is omitted from the default set.
const INTEGRATION_NAME = 'Postgres' as const;

// Only the query span carries an origin (the connect/pool-connect spans don't,
// so they default to 'manual').
const ORIGIN = 'auto.db.orchestrion.postgres';

// OpenTelemetry "OLD" db/net semantic-conventions, inlined to keep this
// integration free of `@opentelemetry/*` deps.
const ATTR_DB_SYSTEM = 'db.system';
const ATTR_DB_NAME = 'db.name';
const ATTR_DB_CONNECTION_STRING = 'db.connection_string';
const ATTR_DB_USER = 'db.user';
const ATTR_DB_STATEMENT = 'db.statement';
const ATTR_NET_PEER_NAME = 'net.peer.name';
const ATTR_NET_PEER_PORT = 'net.peer.port';
const ATTR_PG_PLAN = 'db.postgresql.plan';
const ATTR_PG_IDLE_TIMEOUT = 'db.postgresql.idle.timeout.millis';
const ATTR_PG_MAX_CLIENT = 'db.postgresql.max.client';
const DB_SYSTEM_POSTGRESQL = 'postgresql';

// We set `op: 'db'` and the SQL description directly here (same as mysql
// orchestrion) rather than relying on the OTel pipeline's `inferDbSpanData`
// processor, which only runs in the node SDK, so setting them here is what
// makes the spans correct on the other runtimes
//
// The user-visible span is identical to OTel: query spans are named after
// `db.statement`; connect/pool-connect spans keep these names.
const SPAN_QUERY_FALLBACK = 'pg.query';
const SPAN_CONNECT = 'pg.connect';
const SPAN_POOL_CONNECT = 'pg-pool.connect';

/**
 * The shape orchestrion's transform attaches to the tracing-channel `context`. Documented here rather
 * than imported because orchestrion's runtime doesn't export it.
 */
interface PgChannelContext {
  // The live args array passed to the wrapped `query`/`connect` call.
  arguments: unknown[];
  self?: unknown;
  result?: unknown;
  error?: unknown;
  // The caller's scope, captured at `start` and replayed onto a streamed `Submittable` emitter (see below).
  _sentryCallerScope?: Scope;
}

interface PgConnectionParams {
  database?: string;
  host?: string;
  port?: number;
  user?: string;
  connectionString?: string;
}

interface PgPoolOptions extends PgConnectionParams {
  idleTimeoutMillis?: number;
  // pg-pool stores the max pool size as `max` (defaulting it to 10 in its
  // constructor). The OTel pg instrumentation reads a `maxClient` field that
  // pg-pool never sets, so its `db.postgresql.max.client` attribute is always
  // dropped; we read the real `max` so the attribute is actually populated.
  max?: number;
}

const _postgresChannelIntegration = ((options: { ignoreConnectSpans?: boolean } = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19 so do nothing in that case.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      waitForTracingChannelBinding(() => {
        // Query spans: `pg`/native `Client.prototype.query`. Only this channel can return a streamable
        // `Submittable` result, so it's the only one that defers span-ending to the emitter (see below).
        subscribeQueryLikeChannel(CHANNELS.PG_QUERY, querySpanOptions, { deferStreamedResult: true });

        // Connect spans, gated by `ignoreConnectSpans` (same as OTel pg).
        // `Client.prototype.connect` (pg + native)
        // and `Pool.prototype.connect` (pg-pool).
        if (!options.ignoreConnectSpans) {
          subscribeQueryLikeChannel(CHANNELS.PG_CONNECT, connectSpanOptions);
          subscribeQueryLikeChannel(CHANNELS.PGPOOL_CONNECT, poolConnectSpanOptions);
        }
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Subscribe to a pg tracing-channel and manage a span across its lifecycle.
 * Shared by the query/connect/pool-connect channels. They differ only in how
 * the span's name + attributes are built (`getSpanOptions`), and whether the
 * result can be a streamable emitter (`deferStreamedResult`, query-only).
 */
function subscribeQueryLikeChannel(
  channelName: string,
  getSpanOptions: (ctx: PgChannelContext) => { name: string; op: string; attributes: SpanAttributes },
  { deferStreamedResult = false }: { deferStreamedResult?: boolean } = {},
): void {
  DEBUG_BUILD && debug.log(`[orchestrion:pg] subscribing to channel "${channelName}"`);

  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<PgChannelContext>(channelName),
    data => {
      // Only instrument when there's an active span; returning `undefined` opts this call out entirely,
      // leaving the active context untouched (e.g. connects issued during app startup).
      if (!getActiveSpan()) {
        return undefined;
      }

      // Capture the caller's scope while still synchronously inside the call, for the streamed path:
      // pg dispatches a `Submittable` emitter's events outside the original async scope, so `deferSpanEnd`
      // replays this scope onto that emitter.
      data._sentryCallerScope = getCurrentScope();

      return startInactiveSpan(getSpanOptions(data));
    },
    // `connect`/`pool-connect` resolve with a persistent `Client` (itself an
    // `EventEmitter`), which is NOT a streamed result. Deferring their span
    // to that emitter's `'end'`/`'error'` would keep it open for the whole
    // connection lifetime, so it never ends in time and is dropped. Only
    // `query` can return a streamable `Submittable`, so only it defers.
    deferStreamedResult
      ? {
          // Streamable `Submittable` (e.g. `client.query(new Query())`)
          // returns an emitter that orchestrion stores on `ctx.result` while
          // firing no async events; the query isn't done until the emitter
          // emits `'end'`/`'error'`. Defer ending to those events for that
          // path; the callback, promise, and sync-throw paths carry no
          // emitter, so the helper ends the span as usual.
          deferSpanEnd({ data, end }) {
            const result = data.result;
            if (!result || typeof result !== 'object' || !hasOnMethod(result)) {
              return false;
            }

            // Replay the caller's scope onto the emitter so listeners theu
            // user attaches after the call returns (and any spans they start)
            // nest under the caller, not a fresh root trace.
            const callerScope = data._sentryCallerScope;
            if (callerScope) {
              bindScopeToEmitter(result, callerScope);
            }

            result.on('error', err => end(err));
            result.on('end', () => end());

            return true;
          },
        }
      : undefined,
  );
}

function querySpanOptions(ctx: PgChannelContext): { name: string; op: string; attributes: SpanAttributes } {
  const params = (ctx.self as { connectionParameters?: PgConnectionParams } | undefined)?.connectionParameters ?? {};
  const queryConfig = extractQueryConfig(ctx.arguments);
  return {
    // The description is the SQL statement
    name: queryConfig?.text ?? SPAN_QUERY_FALLBACK,
    op: 'db',
    attributes: {
      ...getConnectionAttributes(params),
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
      [ATTR_DB_STATEMENT]: queryConfig?.text || undefined,
      [ATTR_PG_PLAN]: typeof queryConfig?.name === 'string' ? queryConfig.name : undefined,
    },
  };
}

function connectSpanOptions(ctx: PgChannelContext): { name: string; op: string; attributes: SpanAttributes } {
  const params = (ctx.self as { connectionParameters?: PgConnectionParams } | undefined)?.connectionParameters ?? {};
  // No origin set -> defaults to 'manual'
  return { name: SPAN_CONNECT, op: 'db', attributes: getConnectionAttributes(params) };
}

function poolConnectSpanOptions(ctx: PgChannelContext): { name: string; op: string; attributes: SpanAttributes } {
  const opts = (ctx.self as { options?: PgPoolOptions } | undefined)?.options ?? {};
  return { name: SPAN_POOL_CONNECT, op: 'db', attributes: getPoolConnectionAttributes(opts) };
}

function hasOnMethod(obj: object): obj is { on: (event: string, listener: (arg?: unknown) => void) => unknown } {
  return 'on' in obj && typeof (obj as { on?: unknown }).on === 'function';
}

// `client.query(text, cb?)`, `client.query(text, values, cb?)`, and
// `client.query(configObj, cb?)` are all valid; normalize to `{ text, name }`
// (the only fields the span needs). Returns undefined for invalid args.
function extractQueryConfig(args: unknown[]): { text: string; name?: unknown } | undefined {
  const arg0 = args[0];
  if (typeof arg0 === 'string') {
    return { text: arg0 };
  }
  if (arg0 && typeof arg0 === 'object' && typeof (arg0 as { text?: unknown }).text === 'string') {
    const obj = arg0 as { text: string; name?: unknown };
    return { text: obj.text, name: obj.name };
  }
  return undefined;
}

function getConnectionAttributes(params: PgConnectionParams): SpanAttributes {
  return {
    [ATTR_DB_SYSTEM]: DB_SYSTEM_POSTGRESQL,
    [ATTR_DB_CONNECTION_STRING]: getConnectionString(params),
    [ATTR_DB_NAME]: params.database,
    [ATTR_DB_USER]: params.user,
    [ATTR_NET_PEER_NAME]: params.host,
    [ATTR_NET_PEER_PORT]: Number.isInteger(params.port) ? params.port : undefined,
  };
}

function getPoolConnectionAttributes(opts: PgPoolOptions): SpanAttributes {
  let url: URL | undefined;
  try {
    url = opts.connectionString ? new URL(opts.connectionString) : undefined;
  } catch {
    url = undefined;
  }
  const database = url?.pathname.slice(1) || opts.database;
  const host = url?.hostname || opts.host;
  // Mirror OTel's `getSemanticAttributesFromPoolConnection`: prefer the URL's
  // port, but fall back to an explicit `opts.port` when the connection string
  // omits it (`Number('')` / `Number(undefined)` -> falsy).
  const port = Number(url?.port) || (Number.isInteger(opts.port) ? opts.port : undefined);
  const user = url?.username || opts.user;
  return {
    [ATTR_DB_SYSTEM]: DB_SYSTEM_POSTGRESQL,
    [ATTR_DB_CONNECTION_STRING]: getConnectionString(opts),
    [ATTR_PG_IDLE_TIMEOUT]: opts.idleTimeoutMillis,
    [ATTR_PG_MAX_CLIENT]: opts.max,
    [ATTR_DB_NAME]: database,
    [ATTR_NET_PEER_PORT]: port,
    // these two come from a url parse and slice, can be ''
    [ATTR_NET_PEER_NAME]: host || undefined,
    [ATTR_DB_USER]: user || undefined,
  };
}

// Builds `postgresql://host:port/database`, masking credentials when a raw
// connection string was provided.
function getConnectionString(params: PgConnectionParams): string {
  if (params.connectionString) {
    try {
      const url = new URL(params.connectionString);
      url.username = '';
      url.password = '';
      return url.toString();
    } catch {
      return 'postgresql://localhost:5432/';
    }
  }
  const host = params.host || 'localhost';
  const port = params.port || 5432;
  const database = params.database || '';
  return `postgresql://${host}:${port}/${database}`;
}

/**
 * EXPERIMENTAL: orchestrion-driven `pg` (node-postgres) integration.
 *
 * Subscribes to the `orchestrion:pg:query`/`:connect` and
 * `orchestrion:pg-pool:connect` diagnostics_channels that the orchestrion code
 * transform injects into `pg`'s `Client.prototype.query`/`connect`
 * and `pg-pool`'s `Pool.prototype.connect`. Requires the orchestrion runtime
 * hook or bundler plugin to be active.
 */
export const postgresChannelIntegration = defineIntegration(_postgresChannelIntegration);
