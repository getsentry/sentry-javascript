// Portable instrumentation for https://github.com/porsager/postgres
// This can be used in any environment (Node.js, Cloudflare Workers, etc.)
// without depending on OpenTelemetry module hooking.

import { DEBUG_BUILD } from '../debug-build';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../semanticAttributes';
import { SPAN_STATUS_ERROR, startSpanManual } from '../tracing';
import type { Span } from '../types-hoist/span';
import { debug } from '../utils/debug-logger';
import { getActiveSpan } from '../utils/spanUtils';

const SQL_OPERATION_REGEX = /^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i;

type PostgresConnectionContext = {
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

      if (query && typeof query === 'object' && 'handle' in query) {
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

    if (query && typeof query === 'object' && 'handle' in query) {
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
  const wrappedHandle = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
    if (!_shouldCreateSpans(options)) {
      return originalHandle.apply(this, args);
    }

    const fullQuery = _reconstructQuery(query.strings);
    const sanitizedSqlQuery = _sanitizeSqlQuery(fullQuery);

    return startSpanManual(
      {
        name: sanitizedSqlQuery || 'postgresjs.query',
        op: 'db',
      },
      (span: Span) => {
        span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.db.postgresjs');

        span.setAttributes({
          'db.system.name': 'postgres',
          'db.query.text': sanitizedSqlQuery,
        });

        const connectionContext = sqlInstance
          ? ((sqlInstance as Record<symbol, unknown>)[CONNECTION_CONTEXT_SYMBOL] as
              | PostgresConnectionContext
              | undefined)
          : undefined;

        _setConnectionAttributes(span, connectionContext);

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
              _setOperationName(span, sanitizedSqlQuery, resolveArgs?.[0]?.command);
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

              _setOperationName(span, sanitizedSqlQuery);
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

/**
 * Sanitize SQL query as per the OTEL semantic conventions
 * https://opentelemetry.io/docs/specs/semconv/database/database-spans/#sanitization-of-dbquerytext
 *
 * PostgreSQL $n placeholders are preserved per OTEL spec - they're parameterized queries,
 * not sensitive literals. Only actual values (strings, numbers, booleans) are sanitized.
 *
 * @internal Exported for testing only
 */
export function _sanitizeSqlQuery(sqlQuery: string | undefined): string {
  if (!sqlQuery) {
    return 'Unknown SQL Query';
  }

  return (
    sqlQuery
      // Remove comments first (they may contain newlines and extra spaces)
      .replace(/--.*$/gm, '') // Single line comments (multiline mode)
      .replace(/\/\*[\s\S]*?\*\//g, '') // Multi-line comments
      .replace(/;\s*$/, '') // Remove trailing semicolons
      // Collapse whitespace to a single space (after removing comments)
      .replace(/\s+/g, ' ')
      .trim() // Remove extra spaces and trim
      // Sanitize hex/binary literals before string literals
      .replace(/\bX'[0-9A-Fa-f]*'/gi, '?') // Hex string literals
      .replace(/\bB'[01]*'/gi, '?') // Binary string literals
      // Sanitize string literals (handles escaped quotes)
      .replace(/'(?:[^']|'')*'/g, '?')
      // Sanitize hex numbers
      .replace(/\b0x[0-9A-Fa-f]+/gi, '?')
      // Sanitize boolean literals
      .replace(/\b(?:TRUE|FALSE)\b/gi, '?')
      // Sanitize numeric literals (preserve $n placeholders via negative lookbehind)
      .replace(/-?\b\d+\.?\d*[eE][+-]?\d+\b/g, '?') // Scientific notation
      .replace(/-?\b\d+\.\d+\b/g, '?') // Decimals
      .replace(/-?\.\d+\b/g, '?') // Decimals starting with dot
      .replace(/(?<!\$)-?\b\d+\b/g, '?') // Integers (NOT $n placeholders)
      // Collapse IN clauses for cardinality (both ? and $n variants)
      .replace(/\bIN\b\s*\(\s*\?(?:\s*,\s*\?)*\s*\)/gi, 'IN (?)')
      .replace(/\bIN\b\s*\(\s*\$\d+(?:\s*,\s*\$\d+)*\s*\)/gi, 'IN ($?)')
  );
}

/**
 * Sets connection context attributes on a span.
 */
function _setConnectionAttributes(span: Span, connectionContext: PostgresConnectionContext | undefined): void {
  if (!connectionContext) {
    return;
  }
  if (connectionContext.ATTR_DB_NAMESPACE) {
    span.setAttribute('db.namespace', connectionContext.ATTR_DB_NAMESPACE);
  }
  if (connectionContext.ATTR_SERVER_ADDRESS) {
    span.setAttribute('server.address', connectionContext.ATTR_SERVER_ADDRESS);
  }
  if (connectionContext.ATTR_SERVER_PORT !== undefined) {
    // Port is stored as string in PostgresConnectionContext for requestHook backwards compatibility,
    // but semantic conventions expect port as a number for span attributes
    const portNumber = parseInt(connectionContext.ATTR_SERVER_PORT, 10);
    if (!isNaN(portNumber)) {
      span.setAttribute('server.port', portNumber);
    }
  }
}

/**
 * Extracts DB operation name from SQL query and sets it on the span.
 */
function _setOperationName(span: Span, sanitizedQuery: string | undefined, command?: string): void {
  if (command) {
    span.setAttribute('db.operation.name', command);
    return;
  }
  // Fallback: extract operation from the SQL query
  const operationMatch = sanitizedQuery?.match(SQL_OPERATION_REGEX);
  if (operationMatch?.[1]) {
    span.setAttribute('db.operation.name', operationMatch[1].toUpperCase());
  }
}

/**
 * Extracts and stores connection context from sql.options.
 */
function _attachConnectionContext(sql: unknown, proxiedSql: Record<symbol, unknown>): void {
  const sqlInstance = sql as { options?: { host?: string[]; port?: number[]; database?: string } };
  if (!sqlInstance.options || typeof sqlInstance.options !== 'object') {
    return;
  }

  const opts = sqlInstance.options;
  // postgres.js stores parsed options with host and port as arrays
  // The library defaults to 'localhost' and 5432 if not specified, but we're defensive here
  const host = opts.host?.[0] || 'localhost';
  const port = opts.port?.[0] || 5432;

  const connectionContext: PostgresConnectionContext = {
    ATTR_DB_NAMESPACE: typeof opts.database === 'string' && opts.database !== '' ? opts.database : undefined,
    ATTR_SERVER_ADDRESS: host,
    ATTR_SERVER_PORT: String(port),
  };

  proxiedSql[CONNECTION_CONTEXT_SYMBOL] = connectionContext;
}
