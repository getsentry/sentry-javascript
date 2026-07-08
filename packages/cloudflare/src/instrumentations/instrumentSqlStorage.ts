import type { SqlStorage } from '@cloudflare/workers-types';
import {
  _INTERNAL_getSqlQuerySummary,
  _INTERNAL_sanitizeSqlQuery,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startSpan,
} from '@sentry/core';

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
        const sanitizedQuery = _INTERNAL_sanitizeSqlQuery(query);
        const querySummary = _INTERNAL_getSqlQuerySummary(sanitizedQuery);

        return startSpan(
          {
            op: 'db.query',
            name: querySummary || sanitizedQuery,
            attributes: {
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
