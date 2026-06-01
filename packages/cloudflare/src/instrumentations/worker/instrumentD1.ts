/* eslint-disable @typescript-eslint/unbound-method */
import type { D1Database, D1DatabaseSession, D1PreparedStatement, D1Response } from '@cloudflare/workers-types';
import type { Span, SpanAttributes, StartSpanOptions } from '@sentry/core';
import { addBreadcrumb, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_STATUS_ERROR, startSpan } from '@sentry/core';
import { ensureInstrumented } from '../../instrument';

// Patching is based on internal Cloudflare D1 API
// https://github.com/cloudflare/workerd/blob/cd5279e7b305003f1d9c851e73efa9d67e4b68b2/src/cloudflare/internal/d1-api.ts

const patchedStatement = new WeakSet<D1PreparedStatement>();

/**
 * Patches the query methods of a Cloudflare D1 prepared statement with Sentry.
 */
function instrumentD1PreparedStatementQueries(statement: D1PreparedStatement, query: string): D1PreparedStatement {
  if (patchedStatement.has(statement)) {
    return statement;
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.first = new Proxy(statement.first, {
    apply(target, thisArg, args: Parameters<typeof statement.first>) {
      return startSpan(createStartSpanOptions(query, 'first'), async () => {
        const res = await Reflect.apply(target, thisArg, args);
        createD1Breadcrumb(query, 'first');
        return res;
      });
    },
  });

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.run = new Proxy(statement.run, {
    apply(target, thisArg, args: Parameters<typeof statement.run>) {
      return startSpan(createStartSpanOptions(query, 'run'), async span => {
        const d1Response = await Reflect.apply(target, thisArg, args);
        applyD1ReturnObjectToSpan(span, d1Response);
        createD1Breadcrumb(query, 'run', d1Response);
        return d1Response;
      });
    },
  });

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.all = new Proxy(statement.all, {
    apply(target, thisArg, args: Parameters<typeof statement.all>) {
      return startSpan(createStartSpanOptions(query, 'all'), async span => {
        const d1Result = await Reflect.apply(target, thisArg, args);
        applyD1ReturnObjectToSpan(span, d1Result);
        createD1Breadcrumb(query, 'all', d1Result);
        return d1Result;
      });
    },
  });

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.raw = new Proxy(statement.raw, {
    apply(target, thisArg, args: Parameters<typeof statement.raw>) {
      return startSpan(createStartSpanOptions(query, 'raw'), async () => {
        const res = await Reflect.apply(target, thisArg, args);
        createD1Breadcrumb(query, 'raw');
        return res;
      });
    },
  });

  patchedStatement.add(statement);

  return statement;
}

/**
 * Instruments a Cloudflare D1 prepared statement with Sentry.
 *
 * This is meant to be used as a top-level call, under the hood it calls `instrumentD1PreparedStatementQueries`
 * to patch the query methods. The reason for this abstraction is to ensure that the `bind` method is also patched.
 */
function instrumentD1PreparedStatement(statement: D1PreparedStatement, query: string): D1PreparedStatement {
  // statement.bind() returns a new instance of D1PreparedStatement, so we have to patch it as well.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.bind = new Proxy(statement.bind, {
    apply(target, thisArg, args: Parameters<typeof statement.bind>) {
      return instrumentD1PreparedStatementQueries(Reflect.apply(target, thisArg, args), query);
    },
  });

  return instrumentD1PreparedStatementQueries(statement, query);
}

/**
 * Add D1Response meta information to a span.
 *
 * See: https://developers.cloudflare.com/d1/build-with-d1/d1-client-api/#return-object
 */
function applyD1ReturnObjectToSpan(span: Span, d1Result: D1Response): void {
  if (!d1Result.success) {
    span.setStatus({ code: SPAN_STATUS_ERROR });
  }

  span.setAttributes(getAttributesFromD1Response(d1Result));
}

function getAttributesFromD1Response(d1Result: D1Response): SpanAttributes {
  return {
    'cloudflare.d1.duration': d1Result.meta.duration,
    'cloudflare.d1.rows_read': d1Result.meta.rows_read,
    'cloudflare.d1.rows_written': d1Result.meta.rows_written,
  };
}

type D1QueryType = 'first' | 'run' | 'all' | 'raw' | 'batch' | 'exec';

function createD1Breadcrumb(query: string, type: D1QueryType, d1Result?: D1Response): void {
  addBreadcrumb({
    category: 'query',
    message: query,
    data: {
      ...(d1Result ? getAttributesFromD1Response(d1Result) : {}),
      'db.operation.name': type,
    },
  });
}

function createStartSpanOptions(query: string, type: D1QueryType): StartSpanOptions {
  return {
    op: 'db.query',
    name: query,
    attributes: {
      'db.system.name': 'cloudflare-d1',
      'db.operation.name': type,
      'db.query.text': query,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.d1',
    },
  };
}

function instrumentPrepare(
  prepare: D1Database['prepare'] | D1DatabaseSession['prepare'],
): D1Database['prepare'] | D1DatabaseSession['prepare'] {
  return new Proxy(prepare, {
    apply(target, thisArg, args: Parameters<typeof prepare>) {
      const [query] = args;
      return instrumentD1PreparedStatement(Reflect.apply(target, thisArg, args), query);
    },
  });
}

function instrumentBatch(
  batch: D1Database['batch'] | D1DatabaseSession['batch'],
): D1Database['batch'] | D1DatabaseSession['batch'] {
  return new Proxy(batch, {
    apply(target, thisArg, args: Parameters<typeof batch>) {
      const statements = args[0];
      // D1PreparedStatement exposes a `statement` property at runtime, but it's not in @cloudflare/workers-types.
      // https://github.com/cloudflare/workerd/blob/dc12d7650b4f5d4f9ba6a47aa45fad769cdf8db4/src/cloudflare/internal/d1-api.ts#L210
      const queryText = statements
        .map(statement => (statement as unknown as { statement?: string }).statement ?? '')
        .join('\n');

      return startSpan(
        {
          op: 'db.query',
          name: 'D1 batch',
          attributes: {
            'db.system.name': 'cloudflare-d1',
            'db.operation.name': 'batch',
            'db.query.text': queryText || undefined,
            'db.operation.batch.size': statements.length,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.d1',
          },
        },
        async () => {
          const res = await Reflect.apply(target, thisArg, args);
          createD1Breadcrumb('D1 batch', 'batch');
          return res;
        },
      );
    },
  });
}

function instrumentD1Session(session: D1DatabaseSession): D1DatabaseSession {
  session.prepare = instrumentPrepare(session.prepare);
  session.batch = instrumentBatch(session.batch);
  return session;
}

function _instrumentD1(db: D1Database): D1Database {
  db.prepare = instrumentPrepare(db.prepare);
  db.batch = instrumentBatch(db.batch);

  db.exec = new Proxy(db.exec, {
    apply(target, thisArg, args: Parameters<typeof db.exec>) {
      const [query] = args;
      return startSpan(createStartSpanOptions(query, 'exec'), async () => {
        const res = await Reflect.apply(target, thisArg, args);
        createD1Breadcrumb(query, 'exec');
        return res;
      });
    },
  });

  if ('withSession' in db && typeof db.withSession === 'function') {
    db.withSession = new Proxy(db.withSession, {
      apply(target, thisArg, args: [unknown]) {
        return instrumentD1Session(Reflect.apply(target, thisArg, args) as D1DatabaseSession);
      },
    });
  }

  return db;
}

export function instrumentD1(db: D1Database): D1Database {
  return ensureInstrumented(db, _instrumentD1);
}

/**
 * Instruments Cloudflare D1 bindings with Sentry.
 *
 * @deprecated Use `withSentry()` instead, which automatically instruments all D1 bindings via env.
 *
 * @example
 *
 * ```js
 * // env.DB is the D1 DB binding configured in your `wrangler.toml`
 * const db = instrumentD1WithSentry(env.DB);
 * // Now you can use the database as usual
 * await db.prepare('SELECT * FROM table WHERE id = ?').bind(1).run();
 * ```
 */
export function instrumentD1WithSentry(db: D1Database): D1Database {
  return instrumentD1(db);
}
