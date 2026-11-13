import type { SqlStorage } from '@cloudflare/workers-types';
import {
  SENTRY_OP,
  SENTRY_ORIGIN,
  CLOUDFLARE_DURABLE_OBJECT_QUERY_BINDINGS,
  DB_OPERATION_NAME,
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
} from '@sentry/conventions/attributes';
import { DB_QUERY } from '@sentry/conventions/op';
import { getActiveSpan, getClient, hasSpansEnabled, spanIsSampled, startSpan } from '@sentry/core';
import { getSqlQuerySummary, sanitizeSqlQuery } from '@sentry/server-utils';
import type { CloudflareClientOptions } from '../client';
import { mayTargetCloudflareInternalTable, targetsCloudflareInternalTable } from '../utils/internalSqlQuery';

const SPAN_ATTRIBUTES = {
  [SENTRY_OP]: DB_QUERY,
  [SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object_sql',
  [DB_SYSTEM_NAME]: 'cloudflare-durable-object-sql',
  [DB_OPERATION_NAME]: 'exec',
};

/**
 * Instruments the Durable Object SqlStorage `exec` method with Sentry spans.
 *
 * @param sql - The SqlStorage instance to instrument
 * @returns An instrumented SqlStorage instance
 */
export function instrumentSqlStorage(sql: SqlStorage): SqlStorage {
  return new Proxy(sql, {
    get(target, prop, _receiver) {
      const original = Reflect.get(target, prop, target);

      if (prop !== 'exec' || typeof original !== 'function') {
        return original;
      }

      return function (this: unknown, ...args: unknown[]) {
        const callOriginal = (): ReturnType<SqlStorage['exec']> =>
          (original as (...a: unknown[]) => ReturnType<SqlStorage['exec']>).apply(target, args);

        const [query, ...bindings] = args as [string, ...unknown[]];

        if (childSpanWillNotBeRecorded() && !mayTargetCloudflareInternalTable(query)) {
          // This span is never sent, so skip the costly sanitize and summary
          // steps. We still start the span so it records its dropped span
          // outcome. A query that may target a `cf_` or `pi_` table takes the full path,
          // because an internal query must start no span.
          return startSpan({ name: 'exec', attributes: SPAN_ATTRIBUTES }, callOriginal);
        }

        const sanitizedQuery = sanitizeSqlQuery(query);
        const querySummary = getSqlQuerySummary(sanitizedQuery);

        // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- rule false positive: the cast reaches the Cloudflare-only `durableObjectSqlSpanAllowlist`; tsc errors without it
        const allowlist = (getClient()?.getOptions() as CloudflareClientOptions | undefined)
          ?.durableObjectSqlSpanAllowlist;

        if (targetsCloudflareInternalTable(querySummary, allowlist, sanitizedQuery)) {
          return callOriginal();
        }

        return startSpan(
          {
            name: querySummary || sanitizedQuery,
            attributes: {
              ...SPAN_ATTRIBUTES,
              [DB_QUERY_TEXT]: sanitizedQuery,
              [DB_QUERY_SUMMARY]: querySummary,
              [CLOUDFLARE_DURABLE_OBJECT_QUERY_BINDINGS]: bindings.length,
            },
          },
          callOriginal,
        );
      };
    },
  });
}

/**
 * Returns `true` when `startSpan` creates a non-recording span: spans are disabled, or the active span
 * is not sampled. Must agree with `createChildOrRootSpan` and `_startChildSpan` in `@sentry/core`.
 */
function childSpanWillNotBeRecorded(): boolean {
  if (!hasSpansEnabled()) {
    return true;
  }

  const activeSpan = getActiveSpan();
  return !!activeSpan && !spanIsSampled(activeSpan);
}
