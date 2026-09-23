/* eslint-disable @typescript-eslint/unbound-method */
import type { D1Database, D1DatabaseSession, D1PreparedStatement, D1Response } from '@cloudflare/workers-types';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { DB_QUERY } from '@sentry/conventions/op';
import type { Span, SpanAttributes, StartSpanOptions } from '@sentry/core';
import {
  addBreadcrumb,
  getClient,
  hasSpanStreamingEnabled,
  isEnabled,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startSpan,
} from '@sentry/core';
import { getSqlQuerySummary, sanitizeSqlQuery } from '@sentry/server-utils';
import { ensureInstrumented } from '../../instrument';
import { canRecordSpan } from '../../utils/canRecordSpan';

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

  let queryText: string | undefined;
  const getQueryText = (): string | undefined => (queryText ??= query ? sanitizeSqlQuery(query) : undefined);

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.first = new Proxy(statement.first, {
    apply(target, thisArg, args: Parameters<typeof statement.first>) {
      return runD1Query(getQueryText, 'first', () => Reflect.apply(target, thisArg, args));
    },
  });

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.run = new Proxy(statement.run, {
    apply(target, thisArg, args: Parameters<typeof statement.run>) {
      return runD1Query(getQueryText, 'run', () => Reflect.apply(target, thisArg, args), true);
    },
  });

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.all = new Proxy(statement.all, {
    apply(target, thisArg, args: Parameters<typeof statement.all>) {
      return runD1Query(getQueryText, 'all', () => Reflect.apply(target, thisArg, args), true);
    },
  });

  // eslint-disable-next-line @typescript-eslint/unbound-method
  statement.raw = new Proxy(statement.raw, {
    apply(target, thisArg, args: Parameters<typeof statement.raw>) {
      return runD1Query(getQueryText, 'raw', () => Reflect.apply(target, thisArg, args));
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
 * Runs a D1 query in a span. When no span can be sent, it only adds the breadcrumb, and it skips
 * both when the SDK is disabled. `getQueryText` sanitizes the query on first use.
 *
 * @param hasD1Response - `true` when the query resolves to a `D1Response`, whose meta is added to the span and breadcrumb
 */
async function runD1Query<T>(
  getQueryText: () => string | undefined,
  type: D1QueryType,
  query: () => Promise<T>,
  hasD1Response = false,
): Promise<T> {
  if (!isEnabled()) {
    return query();
  }

  if (!canRecordSpan()) {
    const res = await query();
    createD1Breadcrumb(getQueryText(), type, hasD1Response ? (res as D1Response) : undefined);
    return res;
  }

  const queryText = getQueryText();
  return startSpan(createStartSpanOptions(queryText, type), async span => {
    const res = await query();
    const d1Response = hasD1Response ? (res as D1Response) : undefined;
    if (d1Response) {
      applyD1ReturnObjectToSpan(span, d1Response);
    }
    createD1Breadcrumb(queryText, type, d1Response);
    return res;
  });
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

/** The message is the span's query text (already sanitized) or a static label such as `D1 batch`. */
function createD1Breadcrumb(message: string | undefined, type: D1QueryType, d1Result?: D1Response): void {
  addBreadcrumb({
    category: 'query',
    message,
    data: {
      ...(d1Result ? getAttributesFromD1Response(d1Result) : {}),
      'db.operation.name': type,
    },
  });
}

function createStartSpanOptions(queryText: string | undefined, type: D1QueryType): StartSpanOptions {
  const querySummary = queryText ? getSqlQuerySummary(queryText) : undefined;

  const client = getClient();
  const name =
    client && hasSpanStreamingEnabled(client) ? querySummary || 'cloudflare-d1' : (queryText ?? 'cloudflare-d1');

  return {
    name,
    attributes: {
      [SENTRY_OP]: DB_QUERY,
      'db.system.name': 'cloudflare-d1',
      'db.operation.name': type,
      'db.query.text': queryText,
      'db.query.summary': querySummary,
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

      if (!canRecordSpan()) {
        return (async () => {
          const res = await Reflect.apply(target, thisArg, args);
          if (isEnabled()) {
            createD1Breadcrumb('D1 batch', 'batch');
          }
          return res;
        })();
      }

      // D1PreparedStatement exposes a `statement` property at runtime, but it's not in @cloudflare/workers-types.
      // https://github.com/cloudflare/workerd/blob/dc12d7650b4f5d4f9ba6a47aa45fad769cdf8db4/src/cloudflare/internal/d1-api.ts#L210
      const queryText = statements
        .map(statement => (statement as unknown as { statement?: string }).statement ?? '')
        .filter(Boolean)
        .map(statement => sanitizeSqlQuery(statement))
        .join('\n');

      return startSpan(
        {
          name: 'D1 batch',
          attributes: {
            [SENTRY_OP]: DB_QUERY,
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
      return runD1Query(
        () => (query ? sanitizeSqlQuery(query) : undefined),
        'exec',
        () => Reflect.apply(target, thisArg, args),
      );
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
