import {
  type StartSpanOptions,
  addBreadcrumb,
  captureException,
  debug,
  flushIfServerless,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startSpan,
} from '@sentry/core';
import type { Database, PreparedStatement } from 'db0';
// eslint-disable-next-line import/no-extraneous-dependencies
import { defineNitroPlugin, useDatabase } from 'nitropack/runtime';

type PreparedStatementType = 'get' | 'run' | 'all' | 'raw';

/**
 * Keeps track of prepared statements that have been patched.
 */
const patchedStatement = new WeakSet<PreparedStatement>();

/**
 * Creates a Nitro plugin that instruments the database calls.
 */
export default defineNitroPlugin(() => {
  const db = useDatabase();

  debug.log('@sentry/nuxt: Instrumenting database...');

  instrumentDatabase(db);

  debug.log('@sentry/nuxt: Database instrumented.');
});

function instrumentDatabase(db: Database): void {
  db.prepare = new Proxy(db.prepare, {
    apply(target, thisArg, args: Parameters<typeof db.prepare>) {
      const [query] = args;

      return instrumentPreparedStatement(target.apply(thisArg, args), query, db.dialect);
    },
  });

  // Sadly the `.sql` template tag doesn't call `db.prepare` internally and it calls the connector's `.prepare` directly
  // So we have to patch it manually, and would mean we would have less info in the spans.
  // https://github.com/unjs/db0/blob/main/src/database.ts#L64
  db.sql = new Proxy(db.sql, {
    apply(target, thisArg, args: Parameters<typeof db.sql>) {
      const query = args[0]?.[0] ?? '';
      const opts = createStartSpanOptions(query, db.dialect);

      return startSpan(opts, async span => {
        try {
          const result = await target.apply(thisArg, args);

          return result;
        } catch (error) {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
          captureException(error, {
            mechanism: {
              handled: false,
              type: opts.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN],
            },
          });

          // Re-throw the error to be handled by the caller
          throw error;
        } finally {
          await flushIfServerless();
        }
      });
    },
  });

  db.exec = new Proxy(db.exec, {
    apply(target, thisArg, args: Parameters<typeof db.exec>) {
      return startSpan(createStartSpanOptions(args[0], db.dialect, 'run'), async () => {
        const result = await target.apply(thisArg, args);

        createBreadcrumb(args[0], 'run');

        return result;
      });
    },
  });
}

/**
 * Instruments a DB prepared statement with Sentry.
 *
 * This is meant to be used as a top-level call, under the hood it calls `instrumentPreparedStatementQueries`
 * to patch the query methods. The reason for this abstraction is to ensure that the `bind` method is also patched.
 */
function instrumentPreparedStatement(statement: PreparedStatement, query: string, dialect: string): PreparedStatement {
  // statement.bind() returns a new instance of D1PreparedStatement, so we have to patch it as well.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.bind = new Proxy(statement.bind, {
    apply(target, thisArg, args: Parameters<typeof statement.bind>) {
      return instrumentPreparedStatementQueries(target.apply(thisArg, args), query, dialect);
    },
  });

  return instrumentPreparedStatementQueries(statement, query, dialect);
}

/**
 * Patches the query methods of a DB prepared statement with Sentry.
 */
function instrumentPreparedStatementQueries(
  statement: PreparedStatement,
  query: string,
  dialect: string,
): PreparedStatement {
  if (patchedStatement.has(statement)) {
    return statement;
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.get = new Proxy(statement.get, {
    apply(target, thisArg, args: Parameters<typeof statement.get>) {
      return startSpan(createStartSpanOptions(query, dialect, 'get'), async () => {
        const result = await target.apply(thisArg, args);
        createBreadcrumb(query, 'get');

        return result;
      });
    },
  });

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.run = new Proxy(statement.run, {
    apply(target, thisArg, args: Parameters<typeof statement.run>) {
      return startSpan(createStartSpanOptions(query, dialect, 'run'), async () => {
        const result = await target.apply(thisArg, args);
        createBreadcrumb(query, 'run');

        return result;
      });
    },
  });

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.all = new Proxy(statement.all, {
    apply(target, thisArg, args: Parameters<typeof statement.all>) {
      return startSpan(createStartSpanOptions(query, dialect, 'all'), async () => {
        const result = await target.apply(thisArg, args);
        // Since all has no regular shape, we can assume if it returns an array, it's a success.
        createBreadcrumb(query, 'all');

        return result;
      });
    },
  });

  patchedStatement.add(statement);

  return statement;
}

function createBreadcrumb(query: string, type: PreparedStatementType): void {
  addBreadcrumb({
    category: 'query',
    message: query,
    data: {
      'db.query_type': type,
    },
  });
}

/**
 * Creates a start span options object.
 */
function createStartSpanOptions(query: string, dialect: string, type?: PreparedStatementType): StartSpanOptions {
  return {
    op: 'db.query',
    name: query,
    attributes: {
      'db.system': dialect,
      'db.query_type': type,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.nuxt',
    },
  };
}
