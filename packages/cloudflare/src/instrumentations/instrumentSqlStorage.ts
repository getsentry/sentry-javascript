import type { SqlStorage } from '@cloudflare/workers-types';
import { CODE_FUNCTION_NAME } from '@sentry/conventions/attributes';
import {
  _INTERNAL_getSqlQuerySummary,
  _INTERNAL_sanitizeSqlQuery,
  getClient,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startSpan,
} from '@sentry/core';
import type { CloudflareClientOptions } from '../client';
import { getCallingMethodName } from '../utils/callingMethod';
import { targetsCloudflareInternalTable } from '../utils/internalSqlQuery';

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

        // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- rule false positive: the cast reaches the Cloudflare-only `durableObjectSqlSpanAllowlist`; tsc errors without it
        const allowlist = (getClient()?.getOptions() as CloudflareClientOptions | undefined)
          ?.durableObjectSqlSpanAllowlist;

        if (targetsCloudflareInternalTable(querySummary, allowlist, sanitizedQuery)) {
          return (original as (...a: unknown[]) => ReturnType<SqlStorage['exec']>).apply(target, args);
        }

        // The enclosing span is the operation that triggered this query (e.g. the Durable Object
        // method span) — surface its name so the span shows who triggered it.
        const callingMethod = getCallingMethodName();

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
              [CODE_FUNCTION_NAME]: callingMethod,
            },
          },
          () => (original as (...a: unknown[]) => ReturnType<SqlStorage['exec']>).apply(target, args),
        );
      };
    },
  });
}
