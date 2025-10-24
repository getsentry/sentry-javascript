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
import { defineIntegration, replaceExports, SDK_VERSION, SPAN_STATUS_ERROR, startSpanManual } from '@sentry/core';
import { addOriginToSpan, generateInstrumentOnce } from '@sentry/node-core';

const INTEGRATION_NAME = 'PostgresJs';
const SUPPORTED_VERSIONS = ['>=3.0.0 <4'];

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
      exports => this._patchPostgres(exports),
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
      return exports;
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const WrappedPostgres = function (this: unknown, ...args: unknown[]): unknown {
      const sql = Reflect.construct(Original as (...args: unknown[]) => unknown, args);
      return self._instrumentSqlInstance(sql, args[0]);
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
   * Instruments a sql instance by wrapping its query execution methods.
   */
  private _instrumentSqlInstance(sql: unknown, options: unknown): unknown {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    // Wrap the sql function to intercept query creation
    // This captures user queries but not internal queries made by postgres.js itself
    const proxiedSql = new Proxy(sql as (...args: unknown[]) => unknown, {
      apply(target, thisArg, argumentsList: unknown[]) {
        const query = Reflect.apply(target, thisArg, argumentsList);

        if (query && typeof query === 'object' && 'handle' in query) {
          self._wrapSingleQueryHandle(query as { handle: unknown; strings?: string[] }, proxiedSql);
        }

        return query;
      },
      get(target, prop) {
        return (target as unknown as Record<string | symbol, unknown>)[prop];
      },
    });

    if (options && typeof options === 'object' && sql) {
      const opts = options as Record<string, unknown>;
      // postgres.js defaults host to 'localhost' and port to 5432 if not specified
      const host = opts.host ? (Array.isArray(opts.host) ? opts.host[0] : opts.host) : 'localhost';
      const port = opts.port ? (Array.isArray(opts.port) ? opts.port[0] : opts.port) : 5432;

      const connectionContext = {
        database: (opts.database as string) || '<unknown database>',
        host: host as string,
        port: port as number,
      } as PostgresConnectionContext;

      (proxiedSql as unknown as Record<symbol, unknown>)[CONNECTION_CONTEXT_SYMBOL] = connectionContext;
    }

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
    if ((query.handle as { __sentryWrapped?: boolean }).__sentryWrapped) {
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

      let spanName = sanitizedSqlQuery;
      if (!spanName) {
        const operationMatch = query.strings?.[0]?.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i);
        spanName = operationMatch?.[1] ? `db.${operationMatch[1].toLowerCase()}` : 'db.query';
      }

      return startSpanManual(
        {
          name: spanName,
          op: 'db',
        },
        (span: Span) => {
          addOriginToSpan(span, 'auto.db.otel.postgresjs');

          span.setAttributes({
            [ATTR_DB_SYSTEM_NAME]: 'postgres',
            [ATTR_DB_QUERY_TEXT]: sanitizedSqlQuery,
          });

          const connectionContext = sqlInstance
            ? ((sqlInstance as Record<symbol, unknown>)[CONNECTION_CONTEXT_SYMBOL] as
                | PostgresConnectionContext
                | undefined)
            : undefined;

          if (connectionContext) {
            span.setAttributes({
              [ATTR_DB_NAMESPACE]: connectionContext.database as string,
              [ATTR_SERVER_ADDRESS]: connectionContext.host as string,
              [ATTR_SERVER_PORT]: connectionContext.port as number,
            });
          }

          const config = self.getConfig();
          if (config.requestHook) {
            config.requestHook(span, sanitizedSqlQuery, connectionContext);
          }

          const queryWithCallbacks = this as {
            resolve: unknown;
            reject: unknown;
          };

          queryWithCallbacks.resolve = new Proxy(queryWithCallbacks.resolve as (...args: unknown[]) => unknown, {
            apply: (resolveTarget, resolveThisArg, resolveArgs: [{ command?: string }]) => {
              const result = Reflect.apply(resolveTarget, resolveThisArg, resolveArgs);
              const sqlCommand = resolveArgs?.[0]?.command;
              if (sqlCommand) {
                span.setAttribute(ATTR_DB_OPERATION_NAME, sqlCommand);
              }
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

              span.setAttribute(ATTR_DB_RESPONSE_STATUS_CODE, rejectArgs?.[0]?.code || 'Unknown error');
              span.setAttribute(ATTR_ERROR_TYPE, rejectArgs?.[0]?.name || 'Unknown error');

              const operationMatch = sanitizedSqlQuery?.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i);
              if (operationMatch?.[1]) {
                span.setAttribute(ATTR_DB_OPERATION_NAME, operationMatch[1].toUpperCase());
              }

              const result = Reflect.apply(rejectTarget, rejectThisArg, rejectArgs);
              span.end();
              return result;
            },
          });

          return originalHandle.apply(this, args);
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
        .replace(/--.*?(\r?\n|$)/g, '') // Single line comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // Multi-line comments
        .replace(/;\s*$/, '') // Remove trailing semicolons
        // Collapse whitespace to a single space (after removing comments)
        .replace(/\s+/g, ' ')
        .trim() // Remove extra spaces and trim
        .substring(0, 1024) // Truncate to 1024 characters
        .replace(/\b\d+\b/g, '?') // Replace standalone numbers
        // Collapse IN and in clauses
        // eg. IN (?, ?, ?, ?) to IN (?)
        .replace(/\bIN\b\s*\(\s*\?(?:\s*,\s*\?)*\s*\)/g, 'IN (?)')
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
