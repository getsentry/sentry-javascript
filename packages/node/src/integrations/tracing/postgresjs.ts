// Instrumentation for https://github.com/porsager/postgres
import { context, trace } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
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
  getCurrentScope,
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
 * This instrumentation captures postgresjs queries and their attributes,
 */
export class PostgresJsInstrumentation extends InstrumentationBase<PostgresJsInstrumentationConfig> {
  public constructor(config: PostgresJsInstrumentationConfig) {
    super('sentry-postgres-js', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation.
   */
  public init(): InstrumentationNodeModuleDefinition[] {
    const instrumentationModule = new InstrumentationNodeModuleDefinition('postgres', SUPPORTED_VERSIONS);

    ['src', 'cf/src', 'cjs/src'].forEach(path => {
      instrumentationModule.files.push(
        new InstrumentationNodeModuleFile(
          `postgres/${path}/connection.js`,
          ['*'],
          this._patchConnection.bind(this),
          this._unwrap.bind(this),
        ),
      );

      instrumentationModule.files.push(
        new InstrumentationNodeModuleFile(
          `postgres/${path}/query.js`,
          SUPPORTED_VERSIONS,
          this._patchQuery.bind(this),
          this._unwrap.bind(this),
        ),
      );
    });

    return [instrumentationModule];
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
   * Patches the reject method of the Query class to set the span status and end it
   */
  private _patchReject(rejectTarget: any, span: Span): any {
    return new Proxy(rejectTarget, {
      apply: (
        rejectTarget,
        rejectThisArg,
        rejectArgs: {
          message?: string;
          code?: string;
          name?: string;
        }[],
      ) => {
        span.setStatus({
          code: SPAN_STATUS_ERROR,
          // This message is the error message from the rejectArgs, when available
          // e.g "relation 'User' does not exist"
          message: rejectArgs?.[0]?.message || 'internal_error',
        });

        const result = Reflect.apply(rejectTarget, rejectThisArg, rejectArgs);

        // This status code is PG error code, e.g. '42P01' for "relation does not exist"
        // https://www.postgresql.org/docs/current/errcodes-appendix.html
        span.setAttribute(ATTR_DB_RESPONSE_STATUS_CODE, rejectArgs?.[0]?.code || 'Unknown error');
        // This is the error type, e.g. 'PostgresError' for a Postgres error
        span.setAttribute(ATTR_ERROR_TYPE, rejectArgs?.[0]?.name || 'Unknown error');

        span.end();
        return result;
      },
    });
  }

  /**
   * Patches the resolve method of the Query class to end the span when the query is resolved.
   */
  private _patchResolve(resolveTarget: any, span: Span): any {
    return new Proxy(resolveTarget, {
      apply: (resolveTarget, resolveThisArg, resolveArgs: [{ command?: string }]) => {
        const result = Reflect.apply(resolveTarget, resolveThisArg, resolveArgs);
        const sqlCommand = resolveArgs?.[0]?.command;

        if (sqlCommand) {
          // SQL command is only available when the query is resolved successfully
          span.setAttribute(ATTR_DB_OPERATION_NAME, sqlCommand);
        }
        span.end();
        return result;
      },
    });
  }

  /**
   * Patches the Query class to instrument the handle method.
   */
  private _patchQuery(moduleExports: {
    Query: {
      prototype: {
        handle: any;
      };
    };
  }): any {
    moduleExports.Query.prototype.handle = new Proxy(moduleExports.Query.prototype.handle, {
      apply: async (
        handleTarget,
        handleThisArg: {
          resolve: any;
          reject: any;
          strings?: string[];
        },
        handleArgs,
      ) => {
        if (!this._shouldCreateSpans()) {
          // If we don't need to create spans, just call the original method
          return Reflect.apply(handleTarget, handleThisArg, handleArgs);
        }

        const sanitizedSqlQuery = this._sanitizeSqlQuery(handleThisArg.strings?.[0]);

        return startSpanManual(
          {
            name: sanitizedSqlQuery || 'postgresjs.query',
            op: 'db',
          },
          (span: Span) => {
            const scope = getCurrentScope();
            const postgresConnectionContext = scope.getScopeData().contexts['postgresjsConnection'] as
              | PostgresConnectionContext
              | undefined;

            addOriginToSpan(span, 'auto.db.otel.postgres');

            const { requestHook } = this.getConfig();

            if (requestHook) {
              safeExecuteInTheMiddle(
                () => requestHook(span, sanitizedSqlQuery, postgresConnectionContext),
                error => {
                  if (error) {
                    debug.error(`Error in requestHook for ${INTEGRATION_NAME} integration:`, error);
                  }
                },
              );
            }

            // ATTR_DB_NAMESPACE is used to indicate the database name and the schema name
            // It's only the database name as we don't have the schema information
            const databaseName = postgresConnectionContext?.ATTR_DB_NAMESPACE || '<unknown database>';
            const databaseHost = postgresConnectionContext?.ATTR_SERVER_ADDRESS || '<unknown host>';
            const databasePort = postgresConnectionContext?.ATTR_SERVER_PORT || '<unknown port>';

            span.setAttribute(ATTR_DB_SYSTEM_NAME, 'postgres');
            span.setAttribute(ATTR_DB_NAMESPACE, databaseName);
            span.setAttribute(ATTR_SERVER_ADDRESS, databaseHost);
            span.setAttribute(ATTR_SERVER_PORT, databasePort);
            span.setAttribute(ATTR_DB_QUERY_TEXT, sanitizedSqlQuery);

            handleThisArg.resolve = this._patchResolve(handleThisArg.resolve, span);
            handleThisArg.reject = this._patchReject(handleThisArg.reject, span);

            try {
              return Reflect.apply(handleTarget, handleThisArg, handleArgs);
            } catch (error) {
              span.setStatus({
                code: SPAN_STATUS_ERROR,
              });
              span.end();
              throw error; // Re-throw the error to propagate it
            }
          },
        );
      },
    });

    return moduleExports;
  }

  /**
   * Patches the Connection class to set the database, host, and port attributes
   * when a new connection is created.
   */
  private _patchConnection(Connection: any): any {
    return new Proxy(Connection, {
      apply: (connectionTarget, thisArg, connectionArgs: { database: string; host: string[]; port: number[] }[]) => {
        const databaseName = connectionArgs[0]?.database || '<unknown database>';
        const databaseHost = connectionArgs[0]?.host?.[0] || '<unknown host>';
        const databasePort = connectionArgs[0]?.port?.[0] || '<unknown port>';

        const scope = getCurrentScope();
        scope.setContext('postgresjsConnection', {
          ATTR_DB_NAMESPACE: databaseName,
          ATTR_SERVER_ADDRESS: databaseHost,
          ATTR_SERVER_PORT: databasePort,
        });

        return Reflect.apply(connectionTarget, thisArg, connectionArgs);
      },
    });
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
