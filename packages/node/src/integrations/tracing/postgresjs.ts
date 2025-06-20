// Instrumentation for https://github.com/porsager/postgres
import { SpanStatusCode } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import {
  ATTR_DB_NAMESPACE,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import type { IntegrationFn, Span } from '@sentry/core';
import { defineIntegration, getCurrentScope, startSpanManual } from '@sentry/core';
import { SDK_VERSION } from '@sentry/core';
import { generateInstrumentOnce } from '../../otel/instrument';

const INTEGRATION_NAME = 'PostgresJs';
const SUPPORTED_VERSIONS = ['>=3.0.0 <4'];

export const instrumentPostgresJs = generateInstrumentOnce(INTEGRATION_NAME, () => new PostgresJsInstrumentation());

/**
 * Instrumentation for the [postgres](https://www.npmjs.com/package/postgres) library.
 * This instrumentation captures postgresjs queries and their attributes,
 */
export class PostgresJsInstrumentation extends InstrumentationBase {
  public constructor(config: InstrumentationConfig = {}) {
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
   *
   */
  private _patchReject(rejectTarget: any, span: Span): any {
    return new Proxy(rejectTarget, {
      apply: (
        rejectTarget,
        rejectThisArg,
        rejectArgs: {
          message?: string;
        }[],
      ) => {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: rejectArgs[0]?.message || 'PostgresJs Query Error',
        });

        const result = Reflect.apply(rejectTarget, rejectThisArg, rejectArgs);
        span.end();
        return result;
      },
    });
  }

  /**
   * Patches the resolve method of the Query class to start a span
   * and set the relevant attributes.
   */
  private _patchResolve(resolveTarget: any, span: Span, databaseName: string): any {
    return new Proxy(resolveTarget, {
      apply: (resolveTarget, resolveThisArg, resolveArgs: [{ command?: string; statement?: { string: string } }]) => {
        const sqlCommand = resolveArgs?.[0]?.command;

        const spanDescription = sqlCommand
          ? `${sqlCommand.replace(/\s+/g, ' ').trim()} db:${databaseName}`
          : `Unknown Query db:${databaseName}`;

        span.updateName(spanDescription);

        // Set command and database attributes on the span
        span.setAttribute(ATTR_DB_OPERATION_NAME, sqlCommand);

        const result = Reflect.apply(resolveTarget, resolveThisArg, resolveArgs);
        span.end();
        return result;
      },
    });
  }

  /**
   *
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
          resolveArgs: [{ command?: string; statement?: { string: string } }];
          strings?: string[];
        },
        handleArgs,
      ) => {
        return startSpanManual(
          {
            name: 'postgresjs.query',
            op: 'db',
          },
          (span: Span) => {
            const scope = getCurrentScope();
            const postgresConnectionContext = scope.getScopeData().contexts['postgresjsConnection'] as
              | {
                  ATTR_DB_NAMESPACE: string;
                  ATTR_SERVER_ADDRESS: string;
                  ATTR_SERVER_PORT: string;
                }
              | undefined;

            // ATTR_DB_NAMESPACE is used to indicate the database name and the schema name
            // It's only the database name as we don't have the schema information
            const databaseName = postgresConnectionContext?.ATTR_DB_NAMESPACE || '<unknown database>';
            const databaseHost = postgresConnectionContext?.ATTR_SERVER_ADDRESS || '<unknown host>';
            const databasePort = postgresConnectionContext?.ATTR_SERVER_PORT || '<unknown port>';
            const sanitizedSqlQuery = this._sanitizeSqlQuery(handleThisArg.strings?.[0]);

            span.setAttribute(ATTR_DB_SYSTEM_NAME, 'postgres');
            span.setAttribute(ATTR_DB_NAMESPACE, databaseName);
            span.setAttribute(ATTR_SERVER_ADDRESS, databaseHost);
            span.setAttribute(ATTR_SERVER_PORT, databasePort);
            span.setAttribute(ATTR_DB_QUERY_TEXT, sanitizedSqlQuery);

            handleThisArg.resolve = this._patchResolve(handleThisArg.resolve, span, databaseName);
            handleThisArg.reject = this._patchReject(handleThisArg.reject, span);

            try {
              return Reflect.apply(handleTarget, handleThisArg, handleArgs);
            } catch (error) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: (error as Error).message || 'PostgresJs Query Error',
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
   *
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
