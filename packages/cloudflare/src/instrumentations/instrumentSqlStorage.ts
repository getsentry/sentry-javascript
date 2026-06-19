import type { SqlStorage, SqlStorageCursor, SqlStorageValue } from '@cloudflare/workers-types';
import { _INTERNAL_sanitizeSqlQuery, addBreadcrumb, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';

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

        return startSpan(
          {
            op: 'db.query',
            name: sanitizedQuery,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object.sql',
              'db.system.name': 'cloudflare-durable-object-sql',
              'db.operation.name': 'exec',
              'db.query.text': sanitizedQuery,
              'cloudflare.durable_object.query.bindings': bindings.length,
            },
          },
          () => {
            const cursor: SqlStorageCursor<Record<string, SqlStorageValue>> = (
              original as (...a: unknown[]) => SqlStorageCursor<Record<string, SqlStorageValue>>
            ).apply(target, args);

            addBreadcrumb({
              category: 'query',
              message: sanitizedQuery,
            });

            return cursor;
          },
        );
      };
    },
  });
}
