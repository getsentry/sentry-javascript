// Instrumentation for https://github.com/porsager/postgres
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, startSpan } from '@sentry/core';
import { SDK_VERSION } from '../..';
import { generateInstrumentOnce } from '../../otel/instrument';

const INTEGRATION_NAME = 'PostgresJs';

export const instrumentPostgresJs = generateInstrumentOnce(INTEGRATION_NAME, () => new PostgresJsInstrumentation());

/**
 *
 */
export class PostgresJsInstrumentation extends InstrumentationBase {
  public constructor(config: InstrumentationConfig = {}) {
    super('sentry-postgres-js', SDK_VERSION, config);
  }

  /**
   *
   */
  public init() {
    return [
      new InstrumentationNodeModuleDefinition('postgres', ['*'], this._patch.bind(this), this.unpatch.bind(this), [
        new InstrumentationNodeModuleFile(
          'postgres/src/query.js',
          ['*'],
          this._patchQuery.bind(this),
          this._unpatchQuery.bind(this),
        ),
        new InstrumentationNodeModuleFile(
          'postgres/cf/src/query.js',
          ['*'],
          this._patchQuery.bind(this),
          this._unpatchQuery.bind(this),
        ),
        new InstrumentationNodeModuleFile(
          'postgres/cjs/src/query.js',
          ['*'],
          this._patchQuery.bind(this),
          this._unpatchQuery.bind(this),
        ),
      ]),
    ];
  }

  /**
   *
   */
  private _patchQuery(moduleExports: any, moduleVersion: string) {
    // Not entered
    moduleExports.Query.prototype.cursor = new Proxy(moduleExports.Query.prototype.cursor, {
      apply: (target, thisArg, args) => {
        // console.debug('Query.prototype.cursor thisArg', thisArg);
        debugger;

        return Reflect.apply(target, thisArg, args);
      },
    });

    // Not entered
    moduleExports.Query.prototype.describe = new Proxy(moduleExports.Query.prototype.describe, {
      apply: (target, thisArg, args) => {
        debugger;

        return Reflect.apply(target, thisArg, args);
      },
    });

    // Not entered
    moduleExports.Query.prototype.constructor = new Proxy(moduleExports.Query.prototype.constructor, {
      apply: (target, thisArg, args) => {
        // console.debug('Query constructor thisArg', thisArg);
        // console.debug('Query constructor args', args);
        // console.debug('Query constructor target', target);

        const returnedQuery = Reflect.apply(target, thisArg, args);
        debugger;

        return returnedQuery;
      },
    });

    moduleExports.Query.prototype.execute = new Proxy(moduleExports.Query.prototype.execute, {
      apply: (target, thisArg, args) => {
        const retVal = Reflect.apply(target, thisArg, args);

        debugger;

        return retVal;
      },
    });

    moduleExports.Query.prototype.finally = new Proxy(moduleExports.Query.prototype.finally, {
      apply: (target, thisArg, args) => {
        debugger;

        return Reflect.apply(target, thisArg, args);
      },
    });

    moduleExports.Query.prototype.then = new Proxy(moduleExports.Query.prototype.then, {
      apply: (target, thisArg, args) => {
        // console.debug('Query', moduleExports.Query);
        // console.debug('Query ownProperties', Object.getOwnPropertyNames(moduleExports.Query));
        // console.debug('Query.prototype', moduleExports.Query.prototype);
        // console.debug('Query.prototype ownProperties', Object.getOwnPropertyNames(moduleExports.Query.prototype));
        // console.debug('Query.prototype.constructor', moduleExports.Query.prototype.constructor);
        // console.debug('THEN, thisArg', thisArg);

        return startSpan(
          {
            name: 'postgresjs',
            op: 'db.query',
          },
          async span => {
            const returnValue = await Reflect.apply(target, thisArg, args);

            // debugger;

            return returnValue;
            // // @ts-ignore for now
            // return Reflect.apply(target, thisArg, args).then((result: any) => {
            //   // console.debug('RESULT', result);
            //   // console.debug('THISARG', thisArg);
            //   // console.debug('TARGET', target);
            //   // console.debug('TARGET.prototype', args);
            //   // console.debug('ARGS', args);
            //   // // @ts-ignore for now
            //   // console.debug('resultCommand', result.command);
            //   // // @ts-ignore for now
            //   // console.debug('resultCount', result.count);
            //   // // @ts-ignore for now
            //   // console.debug('resultColumns', result.columns);
            //   // // @ts-ignore for now
            //   // console.debug('resultStatement', result.statement);
            // });
          },
        );
      },
    });

    // const Query = moduleExports.Query;

    // console.debug('moduleExports', moduleExports);
    // console.debug('moduleExports.Query', moduleExports.Query);
    // console.debug('moduleExports.Query.prototype', moduleExports.Query.prototype);

    // console.debug('moduleVersion', moduleVersion);
    // console.debug('PATCHING QUERY');

    return moduleExports;
  }

  /**
   *
   */
  private _unpatchQuery() {
    console.debug('UNPATCHING QUERY');
  }

  /**
   *
   */
  private unpatch() {
    console.debug('UNPATCHING');
  }

  /**
   *
   */
  private _patch(PostgresJs: any) {
    return new Proxy(PostgresJs, {
      apply: (target, thisArg, args) => {
        const sql: any = Reflect.apply(target, thisArg, args);

        return this._patchSQL(sql);
      },
    });
  }

  /**
   *
   */
  private _spanDescriptionFromSqlQuery(sqlCommand: string | undefined) {
    const whiteSpaceCleanedCommand = sqlCommand?.replace(/\s+/g, ' ').trim();

    if (whiteSpaceCleanedCommand?.startsWith('CREATE TABLE') || whiteSpaceCleanedCommand?.startsWith('create table')) {
      // Return 'CREATE TABLE' with the table name (which may or may not be inside quotes)
      // e.g. 'CREATE TABLE "my_table"'
      // or 'CREATE TABLE my_table'
      // or 'CREATE TABLE my_table (id INT, name TEXT)'
      // or 'CREATE TABLE IF NOT EXISTS my_table (id INT, name TEXT)'

      const tableNameMatch = whiteSpaceCleanedCommand.match(/CREATE TABLE\s+([`'"]?)([a-zA-Z0-9_]+)\1/);

      if (tableNameMatch?.[2]) {
        return `CREATE TABLE ${tableNameMatch[2]}`;
      }

      return 'CREATE TABLE';
    }
    if (whiteSpaceCleanedCommand?.startsWith('CREATE INDEX') || whiteSpaceCleanedCommand?.startsWith('create index')) {
      return 'CREATE INDEX';
    }

    const cleanedCommand = whiteSpaceCleanedCommand
      ?.replace(/\s+/g, ' ')
      // Remove `*`
      .replace(/\*/g, '')
      // Remove `INTO` or `into` but keep the table name
      .replace(/(INTO|into)\s+([a-zA-Z0-9_]+)/g, '$2')
      // Remove multiple spaces inside the query
      .replace(/\s{2,}/g, ' ')
      //  Collapse `IN` and `in` clauses e.g. from IN (?, ?, ?, ?) to IN (?),
      .replace(/(IN|in)\s*\(\s*([^,]+,?\s*)+\)/g, '$1 (?)')
      // Keep the table name but remove `FROM` or `from`
      .replace(/(FROM|from)\s+([a-zA-Z0-9_]+)/g, '$2')
      // Remove `WHERE` or `where` and the following conditions
      .replace(/(WHERE|where)\s+[^;]+/g, '')
      // Remove `ORDER BY` or `order by` and the following conditions
      .replace(/(ORDER BY|order by)\s+[^;]+/g, '')
      // Remove `LIMIT` or `limit` and the following conditions
      .replace(/(LIMIT|limit)\s+\d+/g, '')
      // Remove `OFFSET` or `offset` and the following conditions
      .replace(/(OFFSET|offset)\s+\d+/g, '')
      // Remove all parameters and values
      .replace(/(\$[0-9]+|:[a-zA-Z0-9_]+)/g, '')

      .trim();

    debugger;

    return cleanedCommand;
  }

  /**
   *
   */
  private _patchSQL(sql: any) {
    const patchedSQL = new Proxy(sql, {
      apply: async (target, thisArg, args) => {
        return startSpan(
          {
            name: 'postgresjs',
            op: 'db.query',
          },
          async span => {
            const resultPromise = Reflect.apply(target, thisArg, args);
            // console.debug('ARGS', args);

            const result = await resultPromise;

            span.setAttribute('db.system', 'postgres');

            const spanDescription = this._spanDescriptionFromSqlQuery(args[0][0]);

            // TODO: It's not db.statement
            span.setAttribute('db.statement', spanDescription);

            debugger;
            // console.debug('RESULT', result);

            // console.debug('THISARG', thisArg);

            // // @ts-ignore for now
            // console.debug('resultCommand', result.command);
            // // @ts-ignore for now
            // console.debug('resultCount', result.count);
            // // @ts-ignore for now
            // console.debug('resultColumns', result.columns);
            // // @ts-ignore for now
            // console.debug('resultStatement', result.statement);
            // // @ts-ignore for now
            // console.debug('resultState', result.state);

            return result;
          },
        );
      },
    });

    return patchedSQL;
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
