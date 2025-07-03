import type { IntegrationFn } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, captureException, defineIntegration, startSpan } from '@sentry/core';

const INTEGRATION_NAME = 'BunSqlite';

const _bunSqliteIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentBunSqlite();
    },
  };
}) satisfies IntegrationFn;

/**
 * Instruments `bun:sqlite` to automatically create spans and capture errors.
 *
 * Enabled by default in the Bun SDK.
 *
 * ```js
 * Sentry.init({
 *   integrations: [
 *     Sentry.bunSqliteIntegration(),
 *   ],
 * })
 * ```
 */
export const bunSqliteIntegration = defineIntegration(_bunSqliteIntegration);

let hasPatchedBunSqlite = false;

export function _resetBunSqliteInstrumentation(): void {
  hasPatchedBunSqlite = false;
}

/**
 * Instruments bun:sqlite by patching the Database class.
 */
function instrumentBunSqlite(): void {
  if (hasPatchedBunSqlite) {
    return;
  }

  try {
    const sqliteModule = require('bun:sqlite');

    if (!sqliteModule || !sqliteModule.Database) {
      return;
    }

    const OriginalDatabase = sqliteModule.Database;

    const DatabaseProxy = new Proxy(OriginalDatabase, {
      construct(target, args) {
        const instance = new target(...args);
        if (args[0]) {
          Object.defineProperty(instance, '_sentryDbName', {
            value: args[0],
            writable: false,
            enumerable: false,
            configurable: false,
          });
        }
        return instance;
      },
    });

    for (const prop in OriginalDatabase) {
      if (OriginalDatabase.hasOwnProperty(prop)) {
        DatabaseProxy[prop] = OriginalDatabase[prop];
      }
    }

    sqliteModule.Database = DatabaseProxy;

    OriginalDatabase.prototype.constructor = DatabaseProxy;

    const proto = OriginalDatabase.prototype;
    const methodsToInstrument = ['query', 'prepare', 'run', 'exec', 'transaction'];

    const inParentSpanMap = new WeakMap<any, boolean>();
    const dbNameMap = new WeakMap<any, string>();

    methodsToInstrument.forEach(method => {
      if (proto[method]) {
        const originalMethod = proto[method];

        if (originalMethod._sentryInstrumented) {
          return;
        }

        proto[method] = function (this: any, ...args: any[]) {
          let dbName = this._sentryDbName || dbNameMap.get(this);

          if (!dbName && this.filename) {
            dbName = this.filename;
            dbNameMap.set(this, dbName);
          }

          const sql = method !== 'transaction' && args[0] && typeof args[0] === 'string' ? args[0] : undefined;

          if (inParentSpanMap.get(this) && method === 'prepare') {
            const result = originalMethod.apply(this, args);
            if (result) {
              return instrumentStatement(result, sql, dbName);
            }
            return result;
          }

          return startSpan(
            {
              name: sql || 'db.sql.' + method,
              op: `db.sql.${method}`,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.bun.sqlite',
                'db.system': 'sqlite',
                'db.operation': method,
                ...(sql && { 'db.statement': sql }),
                ...(dbName && { 'db.name': dbName }),
              },
            },
            span => {
              try {
                const wasInParentSpan = inParentSpanMap.get(this) || false;
                if (method === 'query') {
                  inParentSpanMap.set(this, true);
                }

                const result = originalMethod.apply(this, args);

                if (wasInParentSpan) {
                  inParentSpanMap.set(this, wasInParentSpan);
                } else {
                  inParentSpanMap.delete(this);
                }

                if (method === 'prepare' && result) {
                  return instrumentStatement(result, sql, dbName);
                }

                return result;
              } catch (error) {
                span.setStatus({ code: 2, message: 'internal_error' });
                captureException(error, {
                  mechanism: {
                    type: 'bun.sqlite',
                    handled: false,
                    data: {
                      function: method,
                    },
                  },
                });
                throw error;
              }
            },
          );
        };

        // Mark the instrumented method
        proto[method]._sentryInstrumented = true;
      }
    });

    hasPatchedBunSqlite = true;
  } catch (error) {
    // Silently fail if bun:sqlite is not available
  }
}

/**
 * Instruments a Statement instance.
 */
function instrumentStatement(statement: any, sql?: string, dbName?: string): any {
  const methodsToInstrument = ['run', 'get', 'all', 'values'];

  methodsToInstrument.forEach(method => {
    if (typeof statement[method] === 'function') {
      statement[method] = new Proxy(statement[method], {
        apply(target, thisArg, args) {
          return startSpan(
            {
              name: `db.statement.${method}`,
              op: `db.sql.statement.${method}`,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.bun.sqlite',
                'db.system': 'sqlite',
                'db.operation': method,
                ...(sql && { 'db.statement': sql }),
                ...(dbName && { 'db.name': dbName }),
              },
            },
            span => {
              try {
                return target.apply(thisArg, args);
              } catch (error) {
                span.setStatus({ code: 2, message: 'internal_error' });
                captureException(error, {
                  mechanism: {
                    type: 'bun.sqlite.statement',
                    handled: false,
                    data: {
                      function: method,
                    },
                  },
                });
                throw error;
              }
            },
          );
        },
      });
    }
  });

  return statement;
}
