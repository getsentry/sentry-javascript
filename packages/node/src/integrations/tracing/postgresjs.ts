/* eslint-disable max-lines */
// Instrumentation for https://github.com/porsager/postgres
import { context, trace } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import {
  ATTR_DB_NAMESPACE,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_RESPONSE_STATUS_CODE,
  ATTR_DB_SYSTEM_NAME,
  ATTR_ERROR_TYPE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import type { IntegrationFn, Span } from '@sentry/core';
import {
  debug,
  defineIntegration,
  replaceExports,
  SDK_VERSION,
  SPAN_STATUS_ERROR,
  startSpanManual,
} from '@sentry/core';
import { addOriginToSpan, generateInstrumentOnce } from '@sentry/node-core';
import { DEBUG_BUILD } from '../../debug-build';

const INTEGRATION_NAME = 'PostgresJs';
const SUPPORTED_VERSIONS = ['>=3.0.0 <4'];
const SQL_OPERATION_REGEX = /^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i;

type PostgresConnectionContext = {
  database?: string;
  host?: string;
  port?: number;
};

const CONNECTION_CONTEXT_SYMBOL = Symbol('sentryPostgresConnectionContext');

type PostgresJsInstrumentationConfig = InstrumentationConfig & {
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
};

export const instrumentPostgresJs = generateInstrumentOnce(
  INTEGRATION_NAME,
  (options?: PostgresJsInstrumentationConfig) =>
    new PostgresJsInstrumentation({
      requireParentSpan: options?.requireParentSpan ?? true,
      requestHook: options?.requestHook,
    }),
);

/**
 * Instrumentation for the [postgres](https://www.npmjs.com/package/postgres) library.
 * This instrumentation captures postgresjs queries and their attributes.
 *
 * Uses internal Sentry patching patterns to support both CommonJS and ESM environments.
 */
export class PostgresJsInstrumentation extends InstrumentationBase<PostgresJsInstrumentationConfig> {
  public constructor(config: PostgresJsInstrumentationConfig) {
    super('sentry-postgres-js', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by patching the postgres module.
   */
  public init(): InstrumentationNodeModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      'postgres',
      SUPPORTED_VERSIONS,
      exports => {
        try {
          return this._patchPostgres(exports);
        } catch (e) {
          DEBUG_BUILD && debug.error('Failed to patch postgres module:', e);
          return exports;
        }
      },
      exports => exports,
    );
    return module;
  }

  /**
   * Patches the postgres module by wrapping the main export function.
   * This intercepts the creation of sql instances and instruments them.
   */
  private _patchPostgres(exports: { [key: string]: unknown }): { [key: string]: unknown } {
    // In CJS: exports is the function itself
    // In ESM: exports.default is the function
    const isFunction = typeof exports === 'function';
    const Original = isFunction ? exports : exports.default;

    if (typeof Original !== 'function') {
      DEBUG_BUILD && debug.warn('postgres module does not export a function. Skipping instrumentation.');
      return exports;
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const WrappedPostgres = function (this: unknown, ...args: unknown[]): unknown {
      const sql = Reflect.construct(Original as (...args: unknown[]) => unknown, args);
      return self._instrumentSqlInstance(sql);
    };

    Object.setPrototypeOf(WrappedPostgres, Original);
    Object.setPrototypeOf(WrappedPostgres.prototype, (Original as { prototype: object }).prototype);

    for (const key of Object.getOwnPropertyNames(Original)) {
      if (!['length', 'name', 'prototype'].includes(key)) {
        const descriptor = Object.getOwnPropertyDescriptor(Original, key);
        if (descriptor) {
          Object.defineProperty(WrappedPostgres, key, descriptor);
        }
      }
    }

    // For CJS: the exports object IS the function, so return the wrapped function
    // For ESM: replace the default export
    if (isFunction) {
      return WrappedPostgres as unknown as { [key: string]: unknown };
    } else {
      replaceExports(exports, 'default', WrappedPostgres);
      return exports;
    }
  }

  /**
   * Wraps query-returning methods (unsafe, file) to ensure their queries are instrumented.
   */
  private _wrapQueryMethod(
    original: (...args: unknown[]) => unknown,
    target: unknown,
    proxiedSql: unknown,
  ): (...args: unknown[]) => unknown {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return function (this: unknown, ...args: unknown[]): unknown {
      const query = Reflect.apply(original, target, args);

      if (query && typeof query === 'object' && 'handle' in query) {
        self._wrapSingleQueryHandle(query as { handle: unknown; strings?: string[] }, proxiedSql);
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
  private _wrapCallbackMethod(
    original: (...args: unknown[]) => unknown,
    target: unknown,
    parentSqlInstance: unknown,
  ): (...args: unknown[]) => unknown {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
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
            return self._instrumentSqlInstance(sqlInstance, parentContext);
          });
        }
        return result;
      }

      // Callback-based call: wrap the callback to instrument the Sql instance
      const callback = (args.length === 1 ? args[0] : args[1]) as (sql: unknown) => unknown;
      const wrappedCallback = function (sqlInstance: unknown): unknown {
        const instrumentedSql = self._instrumentSqlInstance(sqlInstance, parentContext);
        return callback(instrumentedSql);
      };

      const newArgs = args.length === 1 ? [wrappedCallback] : [args[0], wrappedCallback];
      return Reflect.apply(original, target, newArgs);
    };
  }

  /**
   * Sets connection context attributes on a span.
   */
  private _setConnectionAttributes(span: Span, connectionContext: PostgresConnectionContext | undefined): void {
    if (!connectionContext) {
      return;
    }
    if (connectionContext.database) {
      span.setAttribute(ATTR_DB_NAMESPACE, connectionContext.database);
    }
    if (connectionContext.host) {
      span.setAttribute(ATTR_SERVER_ADDRESS, connectionContext.host);
    }
    if (connectionContext.port !== undefined) {
      span.setAttribute(ATTR_SERVER_PORT, connectionContext.port);
    }
  }

  /**
   * Extracts DB operation name from SQL query and sets it on the span.
   */
  private _setOperationName(span: Span, sanitizedQuery: string | undefined, command?: string): void {
    if (command) {
      span.setAttribute(ATTR_DB_OPERATION_NAME, command);
      return;
    }
    // Fallback: extract operation from the SQL query
    const operationMatch = sanitizedQuery?.match(SQL_OPERATION_REGEX);
    if (operationMatch?.[1]) {
      span.setAttribute(ATTR_DB_OPERATION_NAME, operationMatch[1].toUpperCase());
    }
  }

  /**
   * Extracts and stores connection context from sql.options.
   */
  private _attachConnectionContext(sql: unknown, proxiedSql: Record<symbol, unknown>): void {
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
      database: typeof opts.database === 'string' && opts.database !== '' ? opts.database : undefined,
      host,
      port,
    };

    proxiedSql[CONNECTION_CONTEXT_SYMBOL] = connectionContext;
  }

  /**
   * Instruments a sql instance by wrapping its query execution methods.
   */
  private _instrumentSqlInstance(sql: unknown, parentConnectionContext?: PostgresConnectionContext): unknown {
    // Check if already instrumented to prevent double-wrapping
    if ((sql as { __sentryInstrumented?: boolean }).__sentryInstrumented) {
      return sql;
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    // Wrap the sql function to intercept query creation
    const proxiedSql: unknown = new Proxy(sql as (...args: unknown[]) => unknown, {
      apply(target, thisArg, argumentsList: unknown[]) {
        const query = Reflect.apply(target, thisArg, argumentsList);

        if (query && typeof query === 'object' && 'handle' in query) {
          self._wrapSingleQueryHandle(query as { handle: unknown; strings?: string[] }, proxiedSql);
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
          return self._wrapQueryMethod(original as (...args: unknown[]) => unknown, target, proxiedSql);
        }

        // Wrap begin and reserve (not savepoint to avoid duplicate spans)
        if (prop === 'begin' || prop === 'reserve') {
          return self._wrapCallbackMethod(original as (...args: unknown[]) => unknown, target, proxiedSql);
        }

        return original;
      },
    });

    // Use provided parent context if available, otherwise extract from sql.options
    if (parentConnectionContext) {
      (proxiedSql as Record<symbol, unknown>)[CONNECTION_CONTEXT_SYMBOL] = parentConnectionContext;
    } else {
      this._attachConnectionContext(sql, proxiedSql as Record<symbol, unknown>);
    }

    // Mark as instrumented to prevent double-wrapping
    (sql as { __sentryInstrumented?: boolean }).__sentryInstrumented = true;

    return proxiedSql;
  }

  /**
   * Wraps a single query's handle method to create spans.
   */
  private _wrapSingleQueryHandle(
    query: { handle: unknown; strings?: string[]; __sentryWrapped?: boolean },
    sqlInstance: unknown,
  ): void {
    // Prevent double wrapping - check if the handle itself is already wrapped
    if ((query.handle as { __sentryWrapped?: boolean })?.__sentryWrapped) {
      return;
    }

    const originalHandle = query.handle as (...args: unknown[]) => Promise<unknown>;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    // IMPORTANT: We must replace the handle function directly, not use a Proxy,
    // because Query.then() internally calls this.handle(), which would bypass a Proxy wrapper.
    const wrappedHandle = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      if (!self._shouldCreateSpans()) {
        return originalHandle.apply(this, args);
      }

      const sanitizedSqlQuery = self._sanitizeSqlQuery(query.strings?.[0]);

      let spanName = sanitizedSqlQuery?.trim() || '';
      if (!spanName) {
        // Fallback: try to extract operation from the sanitized query
        const operationMatch = sanitizedSqlQuery?.match(SQL_OPERATION_REGEX);
        spanName = operationMatch?.[1] ? `db.${operationMatch[1].toLowerCase()}` : 'db.query';
      }

      return startSpanManual(
        {
          name: spanName,
          op: 'db',
        },
        (span: Span) => {
          addOriginToSpan(span, 'auto.db.otel.postgres');

          span.setAttributes({
            [ATTR_DB_SYSTEM_NAME]: 'postgres',
            [ATTR_DB_QUERY_TEXT]: sanitizedSqlQuery,
          });

          const connectionContext = sqlInstance
            ? ((sqlInstance as Record<symbol, unknown>)[CONNECTION_CONTEXT_SYMBOL] as
                | PostgresConnectionContext
                | undefined)
            : undefined;

          self._setConnectionAttributes(span, connectionContext);

          const config = self.getConfig();
          if (config.requestHook) {
            try {
              config.requestHook(span, sanitizedSqlQuery, connectionContext);
            } catch (e) {
              DEBUG_BUILD && debug.error(`Error in requestHook for ${INTEGRATION_NAME} integration:`, e);
            }
          }

          const queryWithCallbacks = this as {
            resolve: unknown;
            reject: unknown;
          };

          queryWithCallbacks.resolve = new Proxy(queryWithCallbacks.resolve as (...args: unknown[]) => unknown, {
            apply: (resolveTarget, resolveThisArg, resolveArgs: [{ command?: string }]) => {
              const result = Reflect.apply(resolveTarget, resolveThisArg, resolveArgs);
              self._setOperationName(span, sanitizedSqlQuery, resolveArgs?.[0]?.command);
              span.end();
              return result;
            },
          });

          queryWithCallbacks.reject = new Proxy(queryWithCallbacks.reject as (...args: unknown[]) => unknown, {
            apply: (rejectTarget, rejectThisArg, rejectArgs: { message?: string; code?: string; name?: string }[]) => {
              span.setStatus({
                code: SPAN_STATUS_ERROR,
                message: rejectArgs?.[0]?.message || 'unknown_error',
              });

              span.setAttribute(ATTR_DB_RESPONSE_STATUS_CODE, rejectArgs?.[0]?.code || 'unknown');
              span.setAttribute(ATTR_ERROR_TYPE, rejectArgs?.[0]?.name || 'unknown');

              self._setOperationName(span, sanitizedSqlQuery);

              const result = Reflect.apply(rejectTarget, rejectThisArg, rejectArgs);
              span.end();
              return result;
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
   * If `requireParentSpan` is set to true in the configuration, a span will
   * only be created if there is a parent span available.
   */
  private _shouldCreateSpans(): boolean {
    const config = this.getConfig();
    const hasParentSpan = trace.getSpan(context.active()) !== undefined;
    return hasParentSpan || !config.requireParentSpan;
  }

  /**
   * Sanitize SQL query as per the OTEL semantic conventions
   * https://opentelemetry.io/docs/specs/semconv/database/database-spans/#sanitization-of-dbquerytext
   */
  private _sanitizeSqlQuery(sqlQuery: string | undefined): string {
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
        // Replace standalone numbers and parameterized queries ($1, $2, etc.) BEFORE truncation
        .replace(/\$\d+/g, '?') // Replace PostgreSQL placeholders ($1, $2, etc.)
        .replace(/\b\d+\b/g, '?') // Replace standalone numbers
        // Collapse IN and in clauses (eg. IN (?, ?, ?, ?) to IN (?))
        .replace(/\bIN\b\s*\(\s*\?(?:\s*,\s*\?)*\s*\)/gi, 'IN (?)')
        .substring(0, 1024) // Truncate to 1024 characters AFTER sanitization
    );
  }
}

const _postgresJsIntegration = ((options?: PostgresJsInstrumentationConfig) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentPostgresJs(options);
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [postgres](https://www.npmjs.com/package/postgres) library.
 *
 * For more information, see the [`postgresIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/postgres/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.postgresJsIntegration()],
 * });
 * ```
 */

export const postgresJsIntegration = defineIntegration(_postgresJsIntegration);
