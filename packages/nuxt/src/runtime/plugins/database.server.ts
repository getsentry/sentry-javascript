import {
  addBreadcrumb,
  captureException,
  debug,
  flushIfServerless,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  type Span,
  SPAN_STATUS_ERROR,
  startSpan,
  type StartSpanOptions,
} from '@sentry/core';
import type { Database, PreparedStatement } from 'db0';
import { defineNitroPlugin, useDatabase } from 'nitropack/runtime';
import type { DatabaseConnectionConfig as DatabaseConfig } from 'nitropack/types';
// @ts-expect-error - This is a virtual module
import { databaseConfig } from '#sentry/database-config.mjs';
import { type DatabaseSpanData, getDatabaseSpanData } from '../utils/database-span-data';

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
 * Creates a Nitro plugin that instruments the database calls.
 */
export default defineNitroPlugin(() => {
  try {
    const _databaseConfig = databaseConfig as Record<string, DatabaseConfig>;
    const databaseInstances = Object.keys(databaseConfig);
    debug.log('[Nitro Database Plugin]: Instrumenting databases...');

    for (const instance of databaseInstances) {
      debug.log('[Nitro Database Plugin]: Instrumenting database instance:', instance);
      const db = useDatabase(instance);
      instrumentDatabase(db, _databaseConfig[instance]);
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
});

/**
 * Instruments a database instance with Sentry.
 */
function instrumentDatabase(db: MaybeInstrumentedDatabase, config?: DatabaseConfig): void {
  if (db.__sentry_instrumented__) {
    debug.log('[Nitro Database Plugin]: Database already instrumented. Skipping...');
    return;
  }

  const metadata: DatabaseSpanData = {
    'db.system.name': config?.connector ?? db.dialect,
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
      const query = args[0]?.[0] ?? '';
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
 * Creates a span start callback handler
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
  return {
    name: query,
    attributes: {
      'db.query.text': query,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SENTRY_ORIGIN,
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.query',
      ...data,
    },
  };
}
