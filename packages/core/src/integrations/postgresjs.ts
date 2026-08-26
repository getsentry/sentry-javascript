// Portable instrumentation for https://github.com/porsager/postgres
// This can be used in any environment (Node.js, Cloudflare Workers, etc.)
// without depending on OpenTelemetry module hooking.
/* eslint-disable max-lines */

import { getClient } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import { SPAN_STATUS_ERROR } from '../tracing';
import { hasSpanStreamingEnabled } from '../tracing/spans/hasSpanStreamingEnabled';
import { startSpanManual } from '../tracing/trace';
import type { Span, SpanAttributes } from '../types/span';
import { getSqlQuerySummary } from '../utils/sql';
import { debug } from '../utils/debug-logger';
import { isObjectLike } from '../utils/is';
import { getActiveSpan } from '../utils/spanUtils';
import {
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';

const SQL_OPERATION_REGEX = /^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i;

export type PostgresConnectionContext = {
  ATTR_DB_NAMESPACE?: string;
  ATTR_SERVER_ADDRESS?: string;
  ATTR_SERVER_PORT?: string;
};

interface PostgresJsSqlInstrumentationOptions {
  /**
   * Whether to require a parent span for the instrumentation.
   * If set to true, the instrumentation will only create spans if there is a parent span
   * available in the current scope.
   * @default true
   */
  requireParentSpan?: boolean;
  /**
   * Hook to modify the span before it is started.
   * This can be used to set additional attributes or modify the span in any way.
   */
  requestHook?: (span: Span, sanitizedSqlQuery: string, postgresConnectionContext?: PostgresConnectionContext) => void;
}

const CONNECTION_CONTEXT_SYMBOL = Symbol('sentryPostgresConnectionContext');

// Use the same Symbol.for() markers as the Node.js OTel instrumentation
// so that both approaches recognize each other and prevent double-wrapping.
const INSTRUMENTED_MARKER = Symbol.for('sentry.instrumented.postgresjs');
// Marker to track if a query was created from an instrumented sql instance.
// This prevents double-spanning when both the wrapper and the Node.js Query.prototype
// fallback patch are active simultaneously.
const QUERY_FROM_INSTRUMENTED_SQL = Symbol.for('sentry.query.from.instrumented.sql');

/**
 * Instruments a postgres.js `sql` instance with Sentry tracing.
 *
 * This is a portable instrumentation function that works in any environment
 * (Node.js, Cloudflare Workers, etc.) without depending on OpenTelemetry.
 *
 * @example
 * ```javascript
 * import postgres from 'postgres';
 * import * as Sentry from '@sentry/cloudflare'; // or '@sentry/deno'
 *
 * const sql = Sentry.instrumentPostgresJsSql(
 *   postgres({ host: 'localhost', database: 'mydb' })
 * );
 *
 * // All queries now create Sentry spans
 * await sql`SELECT * FROM users WHERE id = ${userId}`;
 * ```
 */
export function instrumentPostgresJsSql<T>(sql: T, options?: PostgresJsSqlInstrumentationOptions): T {
  if (!sql || typeof sql !== 'function') {
    DEBUG_BUILD && debug.warn('instrumentPostgresJsSql: provided value is not a valid postgres.js sql instance');
    return sql;
  }

  return _instrumentSqlInstance(sql, { requireParentSpan: true, ...options }) as T;
}

/**
 * Instruments a sql instance by wrapping its query execution methods.
 */
function _instrumentSqlInstance(
  sql: unknown,
  options: PostgresJsSqlInstrumentationOptions,
  parentConnectionContext?: PostgresConnectionContext,
): unknown {
  // Check if already instrumented to prevent double-wrapping
  // Using Symbol.for() ensures the marker survives proxying
  if ((sql as Record<symbol, unknown>)[INSTRUMENTED_MARKER]) {
    return sql;
  }

  // Wrap the sql function to intercept query creation
  const proxiedSql: unknown = new Proxy(sql as (...args: unknown[]) => unknown, {
    apply(target, thisArg, argumentsList: unknown[]) {
      const query = Reflect.apply(target, thisArg, argumentsList);

      if (isObjectLike(query) && 'handle' in query) {
        _wrapSingleQueryHandle(query as { handle: unknown; strings?: string[] }, proxiedSql, options);
      }

      return query;
    },
    get(target, prop) {
      const original = (target as unknown as Record<string | symbol, unknown>)[prop];

      if (typeof prop !== 'string' || typeof original !== 'function') {
        return original;
      }

      // Wrap methods that return PendingQuery objects (unsafe, file)
      if (prop === 'unsafe' || prop === 'file') {
        return _wrapQueryMethod(original as (...args: unknown[]) => unknown, target, proxiedSql, options);
      }

      // Wrap begin and reserve (not savepoint to avoid duplicate spans)
      if (prop === 'begin' || prop === 'reserve') {
        return _wrapCallbackMethod(original as (...args: unknown[]) => unknown, target, proxiedSql, options);
      }

      return original;
    },
  });

  // Use provided parent context if available, otherwise extract from sql.options
  if (parentConnectionContext) {
    (proxiedSql as Record<symbol, unknown>)[CONNECTION_CONTEXT_SYMBOL] = parentConnectionContext;
  } else {
    _attachConnectionContext(sql, proxiedSql as Record<symbol, unknown>);
  }

  // Mark both the original and proxy as instrumented to prevent double-wrapping
  (sql as Record<symbol, unknown>)[INSTRUMENTED_MARKER] = true;
  (proxiedSql as Record<symbol, unknown>)[INSTRUMENTED_MARKER] = true;

  return proxiedSql;
}

/**
 * Wraps query-returning methods (unsafe, file) to ensure their queries are instrumented.
 */
function _wrapQueryMethod(
  original: (...args: unknown[]) => unknown,
  target: unknown,
  proxiedSql: unknown,
  options: PostgresJsSqlInstrumentationOptions,
): (...args: unknown[]) => unknown {
  return function (this: unknown, ...args: unknown[]): unknown {
    const query = Reflect.apply(original, target, args);

    if (isObjectLike(query) && 'handle' in query) {
      _wrapSingleQueryHandle(query as { handle: unknown; strings?: string[] }, proxiedSql, options);
    }

    return query;
  };
}

/**
 * Wraps callback-based methods (begin, reserve) to recursively instrument Sql instances.
 * Note: These methods can also be used as tagged templates, which we pass through unchanged.
 *
 * Savepoint is not wrapped to avoid complex nested transaction instrumentation issues.
 * Queries within savepoint callbacks are still instrumented through the parent transaction's Sql instance.
 */
function _wrapCallbackMethod(
  original: (...args: unknown[]) => unknown,
  target: unknown,
  parentSqlInstance: unknown,
  options: PostgresJsSqlInstrumentationOptions,
): (...args: unknown[]) => unknown {
  return function (this: unknown, ...args: unknown[]): unknown {
    // Extract parent context to propagate to child instances
    const parentContext = (parentSqlInstance as Record<symbol, unknown>)[CONNECTION_CONTEXT_SYMBOL] as
      | PostgresConnectionContext
      | undefined;

    // Check if this is a callback-based call by verifying the last argument is a function
    const isCallbackBased = typeof args[args.length - 1] === 'function';

    if (!isCallbackBased) {
      // Not a callback-based call - could be tagged template or promise-based
      const result = Reflect.apply(original, target, args);
      // If result is a Promise (e.g., reserve() without callback), instrument the resolved Sql instance
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return (result as Promise<unknown>).then((sqlInstance: unknown) => {
          return _instrumentSqlInstance(sqlInstance, options, parentContext);
        });
      }
      return result;
    }

    // Callback-based call: wrap the callback to instrument the Sql instance
    const callback = (args.length === 1 ? args[0] : args[1]) as (sql: unknown) => unknown;
    const wrappedCallback = function (sqlInstance: unknown): unknown {
      const instrumentedSql = _instrumentSqlInstance(sqlInstance, options, parentContext);
      return callback(instrumentedSql);
    };

    const newArgs = args.length === 1 ? [wrappedCallback] : [args[0], wrappedCallback];
    return Reflect.apply(original, target, newArgs);
  };
}

/**
 * Wraps a single query's handle method to create spans.
 */
function _wrapSingleQueryHandle(
  query: { handle: unknown; strings?: string[]; __sentryWrapped?: boolean },
  sqlInstance: unknown,
  options: PostgresJsSqlInstrumentationOptions,
): void {
  // Prevent double wrapping - check if the handle itself is already wrapped
  if ((query.handle as { __sentryWrapped?: boolean })?.__sentryWrapped) {
    return;
  }

  // Mark this query as coming from an instrumented sql instance.
  // This prevents the Node.js Query.prototype fallback patch from double-spanning.
  (query as Record<symbol, unknown>)[QUERY_FROM_INSTRUMENTED_SQL] = true;

  const originalHandle = query.handle as (...args: unknown[]) => Promise<unknown>;

  // IMPORTANT: We must replace the handle function directly, not use a Proxy,
  // because Query.then() internally calls this.handle(), which would bypass a Proxy wrapper.
  const wrappedHandle = async function (this: { executed?: boolean }, ...args: unknown[]): Promise<unknown> {
    // postgres.js calls handle() from then/catch/finally — only the first call executes SQL,
    // subsequent calls are no-ops (guarded by this.executed). Skip span creation for no-ops.
    if (this.executed || !_shouldCreateSpans(options)) {
      return originalHandle.apply(this, args);
    }

    const fullQuery = _reconstructQuery(query.strings);
    const sanitizedSqlQuery = _sanitizeSqlQuery(fullQuery);

    const client = getClient();
    const querySummary = getSqlQuerySummary(sanitizedSqlQuery);

    const connectionContext = sqlInstance
      ? ((sqlInstance as Record<symbol, unknown>)[CONNECTION_CONTEXT_SYMBOL] as PostgresConnectionContext | undefined)
      : undefined;

    const name =
      client && hasSpanStreamingEnabled(client)
        ? querySummary || connectionContext?.ATTR_DB_NAMESPACE || 'postgres'
        : sanitizedSqlQuery || 'postgresjs.query';

    return startSpanManual(
      {
        name,
        attributes: {
          [SENTRY_OP]: DB,
          [SENTRY_ORIGIN]: 'auto.db.postgresjs',
          [DB_SYSTEM_NAME]: 'postgres',
          [DB_QUERY_TEXT]: sanitizedSqlQuery,
          [DB_QUERY_SUMMARY]: querySummary,
          [DB_OPERATION_NAME]: _getOperationName(sanitizedSqlQuery),
          ...(connectionContext && _getConnectionAttributes(connectionContext)),
        },
      },
      (span: Span) => {
        if (options.requestHook) {
          try {
            options.requestHook(span, sanitizedSqlQuery, connectionContext);
          } catch (e) {
            span.setAttribute('sentry.hook.error', 'requestHook failed');
            DEBUG_BUILD && debug.error('Error in requestHook for PostgresJs instrumentation:', e);
          }
        }

        const queryWithCallbacks = this as {
          resolve: unknown;
          reject: unknown;
        };

        queryWithCallbacks.resolve = new Proxy(queryWithCallbacks.resolve as (...args: unknown[]) => unknown, {
          apply: (resolveTarget, resolveThisArg, resolveArgs: [{ command?: string }]) => {
            try {
              // Re-set the operation name with the server-reported command, which is more reliable than the query text.
              span.setAttribute(DB_OPERATION_NAME, _getOperationName(sanitizedSqlQuery, resolveArgs?.[0]?.command));
              span.end();
            } catch (e) {
              DEBUG_BUILD && debug.error('Error ending span in resolve callback:', e);
            }

            return Reflect.apply(resolveTarget, resolveThisArg, resolveArgs);
          },
        });

        queryWithCallbacks.reject = new Proxy(queryWithCallbacks.reject as (...args: unknown[]) => unknown, {
          apply: (rejectTarget, rejectThisArg, rejectArgs: { message?: string; code?: string; name?: string }[]) => {
            try {
              span.setStatus({
                code: SPAN_STATUS_ERROR,
                message: rejectArgs?.[0]?.message || 'unknown_error',
              });

              span.setAttribute('db.response.status_code', rejectArgs?.[0]?.code || 'unknown');
              span.setAttribute('error.type', rejectArgs?.[0]?.name || 'unknown');

              span.end();
            } catch (e) {
              DEBUG_BUILD && debug.error('Error ending span in reject callback:', e);
            }
            return Reflect.apply(rejectTarget, rejectThisArg, rejectArgs);
          },
        });

        // Handle synchronous errors that might occur before promise is created
        try {
          return originalHandle.apply(this, args);
        } catch (e) {
          span.setStatus({
            code: SPAN_STATUS_ERROR,
            message: e instanceof Error ? e.message : 'unknown_error',
          });
          span.end();
          throw e;
        }
      },
    );
  };

  (wrappedHandle as { __sentryWrapped?: boolean }).__sentryWrapped = true;
  query.handle = wrappedHandle;
}

/**
 * Determines whether a span should be created based on the current context.
 * If `requireParentSpan` is set to true in the options, a span will
 * only be created if there is a parent span available.
 */
function _shouldCreateSpans(options: PostgresJsSqlInstrumentationOptions): boolean {
  const hasParentSpan = getActiveSpan() !== undefined;
  return hasParentSpan || !options.requireParentSpan;
}

/**
 * Reconstructs the full SQL query from template strings with PostgreSQL placeholders.
 *
 * For sql`SELECT * FROM users WHERE id = ${123} AND name = ${'foo'}`:
 *   strings = ["SELECT * FROM users WHERE id = ", " AND name = ", ""]
 *   returns: "SELECT * FROM users WHERE id = $1 AND name = $2"
 *
 * @internal Exported for testing only
 */
export function _reconstructQuery(strings: string[] | undefined): string | undefined {
  if (!strings?.length) {
    return undefined;
  }
  if (strings.length === 1) {
    return strings[0] || undefined;
  }
  // Join template parts with PostgreSQL placeholders ($1, $2, etc.)
  return strings.reduce((acc, str, i) => (i === 0 ? str : `${acc}$${i}${str}`), '');
}

let integerLiteralRE: RegExp | undefined;

/**
 * SQL dialect variants that matter for finding the end of a string literal:
 * - `standard` (PostgreSQL, SQLite): `"` quotes identifiers and `''` is the only in-string escape.
 * - `mysql`: `"` quotes a string literal unless `ANSI_QUOTES` is set, and `\` escapes the next
 *   character unless `NO_BACKSLASH_ESCAPES` is set. Both default to off, and mysql/mysql2 escape
 *   inlined values with backslashes, so this is the mode their statements arrive in.
 */
export type SqlDialect = 'standard' | 'mysql';

/**
 * Returns the index just past the run's closing `delimiter`, or the end of the query if the run is
 * never closed — an unterminated literal must swallow the remainder rather than let it through.
 *
 * A doubled delimiter (`''`) escapes itself in every dialect; backslash escapes are dialect- and
 * context-dependent, so the caller decides.
 */
function findQuotedRunEnd(sql: string, start: number, delimiter: string, backslashEscapes: boolean): number {
  for (let i = start + 1; i < sql.length; i++) {
    const char = sql[i];
    if (backslashEscapes && char === '\\') {
      i++;
    } else if (char === delimiter) {
      if (sql[i + 1] !== delimiter) {
        return i + 1;
      }
      i++;
    }
  }
  return sql.length;
}

/**
 * Replaces every string literal with `?` and drops every comment, in one pass.
 *
 * Doing this by scanning rather than by regex is what keeps quote state and comment state from
 * being decided independently: a regex for `'...'` cannot see that the quote it stopped at was
 * backslash-escaped, and a regex for `--...` cannot see that the `--` sits inside a literal. Both
 * mistakes end with user data surviving into `db.query.text` and `db.query.summary`.
 *
 * Quoted identifiers are preserved — they are the table and column names the query summary is
 * built from.
 */
function stripLiteralsAndComments(sql: string, dialect: SqlDialect): string {
  const isMysql = dialect === 'mysql';
  let out = '';
  let i = 0;

  while (i < sql.length) {
    const char = sql[i]!;
    const next = sql[i + 1];

    if ((char === '-' && next === '-') || (isMysql && char === '#')) {
      const lineEnd = sql.indexOf('\n', i);
      i = lineEnd === -1 ? sql.length : lineEnd;
      continue;
    }

    if (char === '/' && next === '*') {
      const commentEnd = sql.indexOf('*/', i + 2);
      i = commentEnd === -1 ? sql.length : commentEnd + 2;
      continue;
    }

    // Quoted identifiers: backticks in MySQL, double quotes everywhere else
    if (char === '`' || (char === '"' && !isMysql)) {
      const runEnd = findQuotedRunEnd(sql, i, char, false);
      out += sql.slice(i, runEnd);
      i = runEnd;
      continue;
    }

    if (char === "'" || (char === '"' && isMysql)) {
      // A prefix like `X'1A'`, `B'01'` or PostgreSQL's `E'a\nb'` is part of the literal, so it has
      // to collapse into the same `?` instead of being left behind as a bare identifier.
      const prefix = char === "'" ? getLiteralPrefix(out, isMysql) : undefined;
      out = prefix ? out.slice(0, -1) : out;
      i = findQuotedRunEnd(sql, i, char, isMysql || prefix === 'E');
      out += '?';
      continue;
    }

    out += char;
    i++;
  }

  return out;
}

/**
 * Returns the literal-prefix character immediately before a `'`, if there is one: `X`/`B` for
 * hex/binary literals, or `E` for a PostgreSQL escape string (which honors backslash escapes).
 */
function getLiteralPrefix(out: string, isMysql: boolean): 'X' | 'B' | 'E' | undefined {
  // A prefix only counts when it stands alone — the `X` in `MAX'...'` belongs to the identifier
  if (/[\w$]/.test(out.slice(-2, -1))) {
    return undefined;
  }

  const prefix = out.slice(-1).toUpperCase();
  if (prefix === 'X' || prefix === 'B') {
    return prefix;
  }
  return prefix === 'E' && !isMysql ? 'E' : undefined;
}

/**
 * Sanitize SQL query as per the OTEL semantic conventions
 * https://opentelemetry.io/docs/specs/semconv/database/database-spans/#sanitization-of-dbquerytext
 *
 * PostgreSQL $n placeholders are preserved per OTEL spec - they're parameterized queries,
 * not sensitive literals. Only actual values (strings, numbers, booleans) are sanitized.
 *
 * Pass `dialect` when the statement comes from a driver whose literals are not standard-quoted;
 * see {@link SqlDialect}.
 *
 * @internal Exported for testing only
 */
export function _sanitizeSqlQuery(sqlQuery: string | undefined, dialect: SqlDialect = 'standard'): string {
  if (!sqlQuery) {
    return 'Unknown SQL Query';
  }

  // Lazy init: constructing this at module scope would evaluate the lookbehind
  // on import and crash Safari <16.4 browser bundles that reach this file via
  // the core barrel. Building it on first call keeps the cost off the import path.
  if (!integerLiteralRE) {
    integerLiteralRE = new RegExp('(?<!\\$)-?\\b\\d+\\b', 'g');
  }

  return (
    // Strip comments and string literals first: everything below is a regex that cannot tell
    // whether it is looking at SQL syntax or at a user-supplied value.
    stripLiteralsAndComments(sqlQuery, dialect)
      .replace(/;\s*$/, '') // Remove trailing semicolons
      // Collapse whitespace to a single space (after removing comments)
      .replace(/\s+/g, ' ')
      .trim() // Remove extra spaces and trim
      // Sanitize hex numbers
      .replace(/\b0x[0-9A-Fa-f]+/gi, '?')
      // Sanitize boolean literals
      .replace(/\b(?:TRUE|FALSE)\b/gi, '?')
      // Sanitize numeric literals (preserve $n placeholders via negative lookbehind)
      .replace(/-?\b\d+\.?\d*[eE][+-]?\d+\b/g, '?') // Scientific notation
      .replace(/-?\b\d+\.\d+\b/g, '?') // Decimals
      .replace(/-?\.\d+\b/g, '?') // Decimals starting with dot
      .replace(integerLiteralRE, '?') // Integers (NOT $n placeholders)
      // Collapse IN clauses for cardinality (both ? and $n variants)
      .replace(/\bIN\b\s*\(\s*\?(?:\s*,\s*\?)*\s*\)/gi, 'IN (?)')
      .replace(/\bIN\b\s*\(\s*\$\d+(?:\s*,\s*\$\d+)*\s*\)/gi, 'IN ($?)')
  );
}

/**
 * Returns connection context attributes.
 *
 * @internal Exported for the diagnostics-channel integration.
 */
export function _getConnectionAttributes(connectionContext: PostgresConnectionContext): SpanAttributes {
  const attributes: SpanAttributes = {};

  const portNumber = connectionContext.ATTR_SERVER_PORT ? parseInt(connectionContext.ATTR_SERVER_PORT, 10) : undefined;
  const dbNamespace = connectionContext.ATTR_DB_NAMESPACE;
  const serverAddress = connectionContext.ATTR_SERVER_ADDRESS;

  if (dbNamespace) {
    attributes[DB_NAMESPACE] = dbNamespace;
  }
  if (serverAddress) {
    attributes[SERVER_ADDRESS] = serverAddress;
  }
  if (portNumber !== undefined && !isNaN(portNumber)) {
    attributes[SERVER_PORT] = portNumber;
  }

  return attributes;
}

/**
 * Extracts the DB operation name from a SQL query, preferring the server-reported `command`.
 *
 * @internal Exported for the diagnostics-channel integration.
 */
export function _getOperationName(sanitizedQuery: string | undefined, command?: string): string | undefined {
  if (command) {
    return command;
  }
  // Fallback: extract operation from the SQL query
  const operationMatch = sanitizedQuery?.match(SQL_OPERATION_REGEX);
  return operationMatch?.[1]?.toUpperCase();
}

/**
 * Builds a {@link PostgresConnectionContext} from postgres.js' parsed options
 * (which store `host`/`port` as arrays). Defaults to 'localhost'/5432.
 *
 * @internal Exported for the diagnostics-channel integration.
 */
export function _buildConnectionContext(options: {
  host?: string[];
  port?: number[];
  database?: string;
}): PostgresConnectionContext {
  const host = options.host?.[0] || 'localhost';
  const port = options.port?.[0] || 5432;
  return {
    ATTR_DB_NAMESPACE: typeof options.database === 'string' && options.database !== '' ? options.database : undefined,
    ATTR_SERVER_ADDRESS: host,
    ATTR_SERVER_PORT: String(port),
  };
}

/**
 * Extracts and stores connection context from sql.options.
 */
function _attachConnectionContext(sql: unknown, proxiedSql: Record<symbol, unknown>): void {
  const sqlInstance = sql as { options?: { host?: string[]; port?: number[]; database?: string } };
  if (!sqlInstance.options || typeof sqlInstance.options !== 'object') {
    return;
  }

  proxiedSql[CONNECTION_CONTEXT_SYMBOL] = _buildConnectionContext(sqlInstance.options);
}
