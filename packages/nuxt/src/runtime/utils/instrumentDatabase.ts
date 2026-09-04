import { SENTRY_OP } from '@sentry/conventions/attributes';
import { DB_QUERY } from '@sentry/conventions/op';
import {
  addBreadcrumb,
  captureException,
  DB_SPAN_NAME_FALLBACK,
  debug,
  getClient,
  hasSpanStreamingEnabled,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  type Span,
  SPAN_STATUS_ERROR,
  startSpan,
  type StartSpanOptions,
} from '@sentry/core';
import { _INTERNAL_getSqlQuerySummary, _INTERNAL_sanitizeSqlQuery } from '@sentry/core/server';
import { flushIfServerless } from '@sentry/server-utils';
import type { Database, PreparedStatement } from 'db0';
import { type DatabaseConnectionConfig, type DatabaseSpanData, getDatabaseSpanData } from './database-span-data';
import { DB_NAMESPACE, DB_QUERY_SUMMARY, DB_QUERY_TEXT, DB_SYSTEM_NAME } from '@sentry/conventions/attributes';

type MaybeInstrumentedDatabase = Database & {
  __sentry_instrumented__?: boolean;
};

/**
 * Keeps track of prepared statements that have been patched.
 */
const patchedStatement = new WeakSet<PreparedStatement>();

/**
 * The Sentry origin for the database plugin.
 */
const SENTRY_ORIGIN = 'auto.db.nuxt';

/**
 * Creates the Nitro database plugin setup by instrumenting the configured database instances.
 *
 * Called from the version-specific plugin entry points (database.server.ts / database-legacy.server.ts)
 * which supply the correct `useDatabase` import for their respective Nitro version.
 */
export function createDatabasePlugin(
  useDatabase: (name: string) => Database,
  databaseConfig: Record<string, DatabaseConnectionConfig>,
): void {
  try {
    const databaseInstances = Object.keys(databaseConfig);
    debug.log('[Nitro Database Plugin]: Instrumenting databases...');

    for (const instance of databaseInstances) {
      debug.log('[Nitro Database Plugin]: Instrumenting database instance:', instance);
      const db = useDatabase(instance);
      instrumentDatabase(db, databaseConfig[instance]);
    }

    debug.log('[Nitro Database Plugin]: Databases instrumented.');
  } catch (error) {
    // During build time, we can't use the useDatabase function, so we just log an error.
    if (error instanceof Error && /Cannot access 'instances'/.test(error.message)) {
      debug.log('[Nitro Database Plugin]: Database instrumentation skipped during build time.');
      return;
    }

    debug.error('[Nitro Database Plugin]: Failed to instrument database:', error);
  }
}

/**
 * Instruments a database instance with Sentry.
 */
function instrumentDatabase(db: MaybeInstrumentedDatabase, config?: DatabaseConnectionConfig): void {
  if (db.__sentry_instrumented__) {
    debug.log('[Nitro Database Plugin]: Database already instrumented. Skipping...');
    return;
  }

  const metadata: DatabaseSpanData = {
    [DB_SYSTEM_NAME]: config?.connector ?? db.dialect,
    ...getDatabaseSpanData(config),
  };

  db.prepare = new Proxy(db.prepare, {
    apply(target, thisArg, args: Parameters<typeof db.prepare>) {
      const [query] = args;

      return instrumentPreparedStatement(target.apply(thisArg, args), query, metadata);
    },
  });

  // Sadly the `.sql` template tag doesn't call `db.prepare` internally and it calls the connector's `.prepare` directly
  // So we have to patch it manually, and would mean we would have less info in the spans.
  // https://github.com/unjs/db0/blob/main/src/database.ts#L64
  db.sql = new Proxy(db.sql, {
    apply(target, thisArg, args: Parameters<typeof db.sql>) {
      const [strings, ...values] = args;
      const query = strings ? buildSqlTemplateQuery(strings, values) : '';
      const opts = createStartSpanOptions(query, metadata);

      return startSpan(
        opts,
        handleSpanStart(() => target.apply(thisArg, args)),
      );
    },
  });

  db.exec = new Proxy(db.exec, {
    apply(target, thisArg, args: Parameters<typeof db.exec>) {
      return startSpan(
        createStartSpanOptions(args[0], metadata),
        handleSpanStart(() => target.apply(thisArg, args), { query: args[0] }),
      );
    },
  });

  db.__sentry_instrumented__ = true;
}

/**
 * Rebuilds the parameterized statement that db0 hands to the connector from the `.sql` template
 * tag's arguments. Mirrors db0's own template handling: interpolated values become `?` placeholders,
 * except values wrapped in `{}`, which db0 inlines into the statement (e.g. table names).
 *
 * @see https://github.com/unjs/db0/blob/main/src/template.ts
 */
function buildSqlTemplateQuery(strings: TemplateStringsArray, values: unknown[]): string {
  let query = strings[0] || '';

  for (let i = 1; i < strings.length; i++) {
    const chunk = strings[i] ?? '';

    if (query.endsWith('{') && chunk.startsWith('}')) {
      query = `${query.slice(0, -1)}${values[i - 1]}${chunk.slice(1)}`;
    } else {
      query += `?${chunk}`;
    }
  }

  return query.trim();
}

/**
 * Instruments a DB prepared statement with Sentry.
 *
 * This is meant to be used as a top-level call, under the hood it calls `instrumentPreparedStatementQueries`
 * to patch the query methods. The reason for this abstraction is to ensure that the `bind` method is also patched.
 */
function instrumentPreparedStatement(
  statement: PreparedStatement,
  query: string,
  data: DatabaseSpanData,
): PreparedStatement {
  // statement.bind() returns a new instance of D1PreparedStatement, so we have to patch it as well.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.bind = new Proxy(statement.bind, {
    apply(target, thisArg, args: Parameters<typeof statement.bind>) {
      return instrumentPreparedStatementQueries(target.apply(thisArg, args), query, data);
    },
  });

  return instrumentPreparedStatementQueries(statement, query, data);
}

/**
 * Patches the query methods of a DB prepared statement with Sentry.
 */
function instrumentPreparedStatementQueries(
  statement: PreparedStatement,
  query: string,
  data: DatabaseSpanData,
): PreparedStatement {
  if (patchedStatement.has(statement)) {
    return statement;
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.get = new Proxy(statement.get, {
    apply(target, thisArg, args: Parameters<typeof statement.get>) {
      return startSpan(
        createStartSpanOptions(query, data),
        handleSpanStart(() => target.apply(thisArg, args), { query }),
      );
    },
  });

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.run = new Proxy(statement.run, {
    apply(target, thisArg, args: Parameters<typeof statement.run>) {
      return startSpan(
        createStartSpanOptions(query, data),
        handleSpanStart(() => target.apply(thisArg, args), { query }),
      );
    },
  });

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.all = new Proxy(statement.all, {
    apply(target, thisArg, args: Parameters<typeof statement.all>) {
      return startSpan(
        createStartSpanOptions(query, data),
        handleSpanStart(() => target.apply(thisArg, args), { query }),
      );
    },
  });

  patchedStatement.add(statement);

  return statement;
}

/**
 * Creates a span start callback handler.
 */
function handleSpanStart(fn: () => unknown, breadcrumbOpts?: { query: string }) {
  return async (span: Span) => {
    try {
      const result = await fn();
      if (breadcrumbOpts) {
        createBreadcrumb(breadcrumbOpts.query);
      }

      return result;
    } catch (error) {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      captureException(error, {
        mechanism: {
          handled: false,
          type: SENTRY_ORIGIN,
        },
      });

      // Re-throw the error to be handled by the caller
      throw error;
    } finally {
      await flushIfServerless();
    }
  };
}

function createBreadcrumb(query: string): void {
  addBreadcrumb({
    category: 'query',
    message: query,
    data: {
      'db.query.text': query,
    },
  });
}

/**
 * Creates a start span options object.
 */
function createStartSpanOptions(query: string, data: DatabaseSpanData): StartSpanOptions {
  const querySummary = query ? _INTERNAL_getSqlQuerySummary(_INTERNAL_sanitizeSqlQuery(query)) : undefined;

  const client = getClient();
  const name =
    client && hasSpanStreamingEnabled(client)
      ? querySummary || (data[DB_NAMESPACE] as string | undefined) || DB_SPAN_NAME_FALLBACK
      : query;

  return {
    name,
    attributes: {
      [DB_QUERY_TEXT]: query,
      [DB_QUERY_SUMMARY]: querySummary,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SENTRY_ORIGIN,
      [SENTRY_OP]: DB_QUERY,
      ...data,
    },
  };
}
