import type { SqlStorage } from '@cloudflare/workers-types';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { DB_QUERY } from '@sentry/conventions/op';
import { getClient, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import type { CloudflareClientOptions } from '../client';
import { canRecordSpan } from '../utils/canRecordSpan';
import { startLeafSpan } from '../utils/startLeafSpan';
import { targetsCloudflareInternalTable } from '../utils/internalSqlQuery';
import { getSanitizedSqlQuery } from '../utils/sqlQueryCache';

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
        const [query, ...bindings] = args as [string, ...unknown[]];

        if (!canRecordSpan()) {
          return (original as (...a: unknown[]) => ReturnType<SqlStorage['exec']>).apply(target, args);
        }

        const { text: sanitizedQuery, summary: querySummary } = getSanitizedSqlQuery(query);

        // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- rule false positive: the cast reaches the Cloudflare-only `durableObjectSqlSpanAllowlist`; tsc errors without it
        const allowlist = (getClient()?.getOptions() as CloudflareClientOptions | undefined)
          ?.durableObjectSqlSpanAllowlist;

        if (targetsCloudflareInternalTable(querySummary, allowlist, sanitizedQuery)) {
          return (original as (...a: unknown[]) => ReturnType<SqlStorage['exec']>).apply(target, args);
        }

        return startLeafSpan(
          {
            name: querySummary || sanitizedQuery,
            attributes: {
              [SENTRY_OP]: DB_QUERY,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object.sql',
              'db.system.name': 'cloudflare-durable-object-sql',
              'db.operation.name': 'exec',
              'db.query.text': sanitizedQuery,
              'db.query.summary': querySummary,
              'cloudflare.durable_object.query.bindings': bindings.length,
            },
          },
          () => (original as (...a: unknown[]) => ReturnType<SqlStorage['exec']>).apply(target, args),
        );
      };
    },
  });
}
