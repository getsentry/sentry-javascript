import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import {
  DB_OPERATION_BATCH_SIZE,
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import type { IntegrationFn, Span } from '@sentry/core';
import { defineIntegration, getActiveSpan, startInactiveSpan } from '@sentry/core';
import { sanitizeSqlQueryWithSummary } from '../utils/sql';
import { CHANNELS } from '../orchestrion/channels';
import { neonModuleNames } from '../orchestrion/config/neon';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import { bindTracingChannelToSpan } from '../tracing-channel';
import { bindPgQueryChannel, getConnectionAttributes } from './postgres';

const INTEGRATION_NAME = 'Neon' as const;
const ORIGIN = 'auto.db.neon';
const DB_SYSTEM_POSTGRESQL = 'postgresql';
const DEFAULT_PORT = 5432;
const NOOP = (): void => {};

// `sql.query(text, params)` builds the first shape, a tagged-template call the second.
type NeonQueryData = { query: string; params?: unknown[] } | NeonSqlTemplate;

interface NeonSqlTemplate {
  strings: readonly string[];
  values: unknown[];
  toParameterizedQuery?: () => { query: string };
}

interface NeonHttpQueryContext {
  // `[queryData, opts]` for a single query, `[queryData[], opts[]]` for a `transaction()` batch.
  arguments: unknown[];
}

interface NeonResolveConnectionContext {
  result?: { resolvedURL?: URL };
}

// The HTTP query spans this integration started, so the connection-resolver subscriber only
// enriches those and never a user's own active span.
const httpQuerySpans = new WeakSet<Span>();

const _neonIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, neonModuleNames, instrumentNeon, []);
    },
  };
}) satisfies IntegrationFn;

function instrumentNeon(): void {
  // The WebSocket driver is pg's `Client`, bundled into the package, so its query channel gets
  // the pg span shape.
  bindPgQueryChannel(CHANNELS.NEON_QUERY, { origin: ORIGIN });

  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<NeonHttpQueryContext>(CHANNELS.NEON_HTTP_QUERY),
    data => {
      const span = startInactiveSpan(httpQuerySpanOptions(data.arguments));
      httpQuerySpans.add(span);
      return span;
    },
    { requiresParentSpan: true },
  );

  // The connection string is resolved inside the HTTP executor, so the query span is active
  // when this settles. The executor's own context never sees the string.
  diagnosticsChannel.tracingChannel<NeonResolveConnectionContext>(CHANNELS.NEON_RESOLVE_CONNECTION).subscribe({
    start: NOOP,
    end: NOOP,
    asyncStart: NOOP,
    error: NOOP,
    asyncEnd(data) {
      const span = getActiveSpan();
      const url = data.result?.resolvedURL;
      if (!span || !httpQuerySpans.has(span) || !url) {
        return;
      }
      span.setAttributes(
        getConnectionAttributes({
          host: url.hostname,
          port: Number(url.port) || DEFAULT_PORT,
          database: url.pathname.slice(1),
          user: url.username || undefined,
        }),
      );
    },
  });
}

function httpQuerySpanOptions(args: unknown[]): Parameters<typeof startInactiveSpan>[0] {
  const queryData = args[0] as NeonQueryData | NeonQueryData[] | undefined;
  const batchSize = Array.isArray(queryData) ? queryData.length : undefined;
  // A batch gets one span whose text and summary list every statement, in order.
  const statements = (Array.isArray(queryData) ? queryData : [queryData])
    .map(getQueryText)
    .filter((text): text is string => !!text)
    .map(text => sanitizeSqlQueryWithSummary(text));
  const queryText = joinDefined(statements.map(s => s.queryText));
  const querySummary = joinDefined(statements.map(s => s.querySummary));
  const name = querySummary || DB_SYSTEM_POSTGRESQL;

  return {
    name,
    attributes: {
      [SENTRY_OP]: DB,
      [SENTRY_ORIGIN]: ORIGIN,
      [SENTRY_KIND]: 'client',
      [DB_SYSTEM_NAME]: DB_SYSTEM_POSTGRESQL,
      [DB_QUERY_TEXT]: queryText || undefined,
      [DB_QUERY_SUMMARY]: querySummary,
      [DB_OPERATION_BATCH_SIZE]: batchSize,
    },
  };
}

function joinDefined(parts: (string | undefined)[]): string | undefined {
  const defined = parts.filter((part): part is string => !!part);
  return defined.length ? defined.join('; ') : undefined;
}

function getQueryText(data: NeonQueryData | undefined): string | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  if ('query' in data && typeof data.query === 'string') {
    return data.query;
  }
  if (!('strings' in data) || !Array.isArray(data.strings)) {
    return undefined;
  }
  if (typeof data.toParameterizedQuery === 'function') {
    try {
      // Neon's own rendering also inlines `sql.unsafe()` fragments and nested templates.
      return data.toParameterizedQuery().query;
    } catch {
      // fall through to the plain placeholder rendering
    }
  }
  return data.strings.reduce((text, part, i) => `${text}$${i}${part}`);
}

/**
 * Diagnostics-channel-based `@neondatabase/serverless` integration.
 *
 * Subscribes to the channels Sentry's code transform injects into the package's bundled pg
 * `Client.prototype.query` (WebSocket driver) and into the HTTP executor behind `neon()`, so both
 * drivers emit `db` spans with the same shape as the `pg` integration. Requires the Sentry runtime
 * hook or bundler plugin to be active.
 */
export const neonIntegration = defineIntegration(_neonIntegration);
