import type { SqlStorage } from '@cloudflare/workers-types';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { DB_QUERY } from '@sentry/conventions/op';
import {
  getActiveSpan,
  getClient,
  hasSpansEnabled,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanIsSampled,
  startSpan,
} from '@sentry/core';
import { getSqlQuerySummary, sanitizeSqlQuery } from '@sentry/server-utils';
import type { CloudflareClientOptions } from '../client';
import { mayTargetCloudflareInternalTable, targetsCloudflareInternalTable } from '../utils/internalSqlQuery';

const SPAN_ATTRIBUTES = {
  [SENTRY_OP]: DB_QUERY,
  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object.sql',
  'db.system.name': 'cloudflare-durable-object-sql',
  'db.operation.name': 'exec',
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

        const activeSpan = getActiveSpan();
        const spanIsNeverSent = !hasSpansEnabled() || (!!activeSpan && !spanIsSampled(activeSpan));
        if (spanIsNeverSent && !mayTargetCloudflareInternalTable(query)) {
          // The query needs no sanitizing. `startSpan` still runs, so each query starts a span with and
          // without spans enabled, and an unsampled span records its dropped span outcome.
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
              'db.query.text': sanitizedQuery,
              'db.query.summary': querySummary,
              'cloudflare.durable_object.query.bindings': bindings.length,
            },
          },
          callOriginal,
        );
      };
    },
  });
}
