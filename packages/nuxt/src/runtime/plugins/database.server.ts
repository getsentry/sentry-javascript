import {
  type Span,
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
 * The Sentry origin for the database plugin.
 */
const SENTRY_ORIGIN = 'auto.db.nuxt';

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

      return startSpan(
        opts,
        handleSpanStart(() => target.apply(thisArg, args)),
      );
    },
  });

  db.exec = new Proxy(db.exec, {
    apply(target, thisArg, args: Parameters<typeof db.exec>) {
      return startSpan(
        createStartSpanOptions(args[0], db.dialect, 'run'),
        handleSpanStart(() => target.apply(thisArg, args), { query: args[0], type: 'run' }),
      );
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
      return startSpan(
        createStartSpanOptions(query, dialect, 'get'),
        handleSpanStart(() => target.apply(thisArg, args), { query, type: 'get' }),
      );
    },
  });

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.run = new Proxy(statement.run, {
    apply(target, thisArg, args: Parameters<typeof statement.run>) {
      return startSpan(
        createStartSpanOptions(query, dialect, 'run'),
        handleSpanStart(() => target.apply(thisArg, args), { query, type: 'run' }),
      );
    },
  });

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.all = new Proxy(statement.all, {
    apply(target, thisArg, args: Parameters<typeof statement.all>) {
      return startSpan(
        createStartSpanOptions(query, dialect, 'all'),
        handleSpanStart(() => target.apply(thisArg, args), { query, type: 'all' }),
      );
    },
  });

  patchedStatement.add(statement);

  return statement;
}

/**
 * Creates a span start callback handler
 */
function handleSpanStart(fn: () => unknown, breadcrumbOpts?: { query: string; type: PreparedStatementType }) {
  return async (span: Span) => {
    try {
      const result = await fn();
      if (breadcrumbOpts) {
        createBreadcrumb(breadcrumbOpts.query, breadcrumbOpts.type);
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
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SENTRY_ORIGIN,
    },
  };
}
