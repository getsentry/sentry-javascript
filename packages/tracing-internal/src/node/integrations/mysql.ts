import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';
import type { Span } from '@sentry/types';
import { fill, loadModule, logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../../common/debug-build';
import type { LazyLoadedIntegration } from './lazy';

interface MysqlConnection {
  prototype: {
    connect: () => void;
  };
  createQuery: () => void;
}

interface MysqlConnectionConfig {
  host: string;
  port: number;
  user: string;
}

/** Tracing integration for node-mysql package */
export class Mysql implements LazyLoadedIntegration<MysqlConnection> {
  /**
   * @inheritDoc
   */
  public static id: string = 'Mysql';

  /**
   * @inheritDoc
   */
  public name: string;

  private _module?: MysqlConnection;

  public constructor() {
    this.name = Mysql.id;
  }

  /** @inheritdoc */
  public loadDependency(): MysqlConnection | undefined {
    return (this._module = this._module || loadModule('mysql/lib/Connection.js'));
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    const pkg = this.loadDependency();

    if (!pkg) {
      DEBUG_BUILD && logger.error('Mysql Integration was unable to require `mysql` package.');
      return;
    }

    let mySqlConfig: MysqlConnectionConfig | undefined = undefined;

    try {
      pkg.prototype.connect = new Proxy(pkg.prototype.connect, {
        apply(wrappingTarget, thisArg: { config: MysqlConnectionConfig }, args) {
          if (!mySqlConfig) {
            mySqlConfig = thisArg.config;
          }
          return wrappingTarget.apply(thisArg, args);
        },
      });
    } catch (e) {
      DEBUG_BUILD && logger.error('Mysql Integration was unable to instrument `mysql` config.');
    }

    function spanDataFromConfig(): Record<string, string | number | undefined> {
      if (!mySqlConfig) {
        return {};
      }
      return {
        'server.address': mySqlConfig.host,
        'server.port': mySqlConfig.port,
        'db.user': mySqlConfig.user,
      };
    }

    function finishSpan(span: Span | undefined): void {
      if (!span) {
        return;
      }

      const data = spanDataFromConfig();
      Object.keys(data).forEach(key => {
        span.setAttribute(key, data[key]);
      });

      span.end();
    }

    // The original function will have one of these signatures:
    //    function (callback) => void
    //    function (options, callback) => void
    //    function (options, values, callback) => void
    fill(pkg, 'createQuery', function (orig: () => void) {
      return function (this: unknown, options: unknown, values: unknown, callback: unknown) {
        const span = startInactiveSpan({
          onlyIfParent: true,
          name: typeof options === 'string' ? options : (options as { sql: string }).sql,
          op: 'db',
          attributes: {
            'db.system': 'mysql',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.mysql',
          },
        });

        if (typeof callback === 'function') {
          return orig.call(this, options, values, function (err: Error, result: unknown, fields: unknown) {
            finishSpan(span);
            callback(err, result, fields);
          });
        }

        if (typeof values === 'function') {
          return orig.call(this, options, function (err: Error, result: unknown, fields: unknown) {
            finishSpan(span);
            values(err, result, fields);
          });
        }

        // streaming, no callback!
        const query = orig.call(this, options, values) as { on: (event: string, callback: () => void) => void };

        query.on('end', () => {
          finishSpan(span);
        });

        return query;
      };
    });
  }
}
