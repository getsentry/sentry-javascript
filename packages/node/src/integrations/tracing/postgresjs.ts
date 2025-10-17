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
  defineIntegration,
  getCurrentScope,
  replaceExports,
  SDK_VERSION,
  SPAN_STATUS_ERROR,
  startSpanManual,
} from '@sentry/core';
import { addOriginToSpan, generateInstrumentOnce } from '@sentry/node-core';

const INTEGRATION_NAME = 'PostgresJs';
const SUPPORTED_VERSIONS = ['>=3.0.0 <4'];

type PostgresConnectionContext = {
  ATTR_DB_NAMESPACE?: string; // Database name
  ATTR_SERVER_ADDRESS?: string; // Hostname or IP address of the database server
  ATTR_SERVER_PORT?: string; // Port number of the database server
};

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

    // Create a wrapped version of the postgres function
    const WrappedPostgres = function (this: unknown, ...args: unknown[]): unknown {
      // Call the original postgres function to get the sql instance
      const sql = Reflect.construct(Original as (...args: unknown[]) => unknown, args);

      // The sql function is what users call to execute queries
      // Wrap it to intercept query execution
      return self._instrumentSqlInstance(sql, args[0]);
    };

    // Preserve prototype chain and static properties
    Object.setPrototypeOf(WrappedPostgres, Original);
    Object.setPrototypeOf(WrappedPostgres.prototype, (Original as { prototype: object }).prototype);

    // Copy static properties from Original to WrappedPostgres
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
      // ESM: use replaceExports to replace the default export
      replaceExports(exports, 'default', WrappedPostgres);
      return exports;
    }
  }

  /**
   * Instruments a sql instance by wrapping its query execution methods.
   */
  private _instrumentSqlInstance(sql: unknown, options: unknown): unknown {
    // Store connection context from options
    if (options && typeof options === 'object') {
      const opts = options as Record<string, unknown>;
      // postgres.js defaults host to 'localhost' and port to 5432 if not specified
      const host = opts.host ? (Array.isArray(opts.host) ? opts.host[0] : opts.host) : 'localhost';
      const port = opts.port ? (Array.isArray(opts.port) ? opts.port[0] : opts.port) : 5432;

      getCurrentScope().setContext('postgresjsConnection', {
        ATTR_DB_NAMESPACE: (opts.database as string) || '<unknown database>',
        ATTR_SERVER_ADDRESS: host as string,
        ATTR_SERVER_PORT: port as number,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    // Wrap the sql function to intercept query creation
    // This captures user queries but not internal queries made by postgres.js itself
    return new Proxy(sql as (...args: unknown[]) => unknown, {
      apply(target, thisArg, argumentsList: unknown[]) {
        const query = Reflect.apply(target, thisArg, argumentsList);

        // Wrap query if it has a handle method
        if (query && typeof query === 'object' && 'handle' in query) {
          self._wrapSingleQueryHandle(query as { handle: unknown; strings?: string[] });
        }

        return query;
      },
      get(target, prop) {
        return (target as unknown as Record<string, unknown>)[prop as string];
      },
    });
  }

  /**
   * Wraps a single query's handle method to create spans.
   * Used for ESM where we can't patch the Query class.
   */
  private _wrapSingleQueryHandle(query: { handle: unknown; strings?: string[]; __sentryWrapped?: boolean }): void {
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

      return startSpanManual(
        {
          name: sanitizedSqlQuery || 'postgresjs.query',
          op: 'db',
        },
        (span: Span) => {
          addOriginToSpan(span, 'auto.db.otel.postgres');

          span.setAttributes({
            [ATTR_DB_SYSTEM_NAME]: 'postgres',
            [ATTR_DB_QUERY_TEXT]: sanitizedSqlQuery,
          });

          // Get connection context from scope
          const connectionContext = getCurrentScope().getScopeData().contexts?.postgresjsConnection;
          if (connectionContext) {
            span.setAttributes({
              [ATTR_DB_NAMESPACE]: connectionContext.ATTR_DB_NAMESPACE as string,
              [ATTR_SERVER_ADDRESS]: connectionContext.ATTR_SERVER_ADDRESS as string,
              [ATTR_SERVER_PORT]: connectionContext.ATTR_SERVER_PORT as number,
            });
          }

          // Wrap the query's resolve and reject methods
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

              const result = Reflect.apply(rejectTarget, rejectThisArg, rejectArgs);

              span.setAttribute(ATTR_DB_RESPONSE_STATUS_CODE, rejectArgs?.[0]?.code || 'Unknown error');
              span.setAttribute(ATTR_ERROR_TYPE, rejectArgs?.[0]?.name || 'Unknown error');

              // Parse operation name from query for error cases (since we don't get command in reject)
              const operationMatch = sanitizedSqlQuery?.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i);
              if (operationMatch?.[1]) {
                span.setAttribute(ATTR_DB_OPERATION_NAME, operationMatch[1].toUpperCase());
              }

              span.end();
              return result;
            },
          });

          return originalHandle.apply(this, args);
        },
      );
    };

    // Mark the wrapped handle so we don't wrap it again
    (wrappedHandle as { __sentryWrapped?: boolean }).__sentryWrapped = true;
    query.handle = wrappedHandle;
  }

  /**
   * Patches the Query class to intercept all queries including internal ones.
   */
  private _patchQuery(moduleExports: {
    Query: {
      prototype: {
        handle: unknown;
        strings?: string[];
        resolve: unknown;
        reject: unknown;
        __sentryPatched?: boolean;
        __sentryWrapped?: boolean;
      };
    };
  }): { [key: string]: unknown } {
    if (!moduleExports.Query) {
      return moduleExports;
    }

    const originalHandle = moduleExports.Query.prototype.handle;

    // Prevent double patching - check if handle is already wrapped
    if ((originalHandle as { __sentryWrapped?: boolean }).__sentryWrapped) {
      return moduleExports;
    }

    // Use the common wrapping logic for Query.prototype
    this._wrapSingleQueryHandle(moduleExports.Query.prototype as unknown as { handle: unknown; strings?: string[] });

    return moduleExports;
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
        .replace(/\s+/g, ' ')
        .trim() // Remove extra spaces including newlines and trim
        .substring(0, 1024) // Truncate to 1024 characters
        .replace(/--.*?(\r?\n|$)/g, '') // Single line comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // Multi-line comments
        .replace(/;\s*$/, '') // Remove trailing semicolons
        .replace(/\b\d+\b/g, '?') // Replace standalone numbers
        // Collapse whitespace to a single space
        .replace(/\s+/g, ' ')
        // Collapse IN and in clauses
        // eg. IN (?, ?, ?, ?) to IN (?)
        .replace(/\bIN\b\s*\(\s*\?(?:\s*,\s*\?)*\s*\)/g, 'IN (?)')
    );
  }
}

const _postgresJsIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentPostgresJs();
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
