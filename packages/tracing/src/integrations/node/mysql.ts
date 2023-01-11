import type { Hub } from '@sentry/core';
import type { EventProcessor, Integration } from '@sentry/types';
import { fill, loadModule, logger } from '@sentry/utils';

import { shouldDisableAutoInstrumentation } from './utils/node-utils';

interface MysqlConnection {
  createQuery: () => void;
}

/** Tracing integration for node-mysql package */
export class Mysql implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Mysql';

  /**
   * @inheritDoc
   */
  public name: string = Mysql.id;

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (shouldDisableAutoInstrumentation(getCurrentHub)) {
      __DEBUG_BUILD__ && logger.log('Mysql Integration is skipped because of instrumenter configuration.');
      return;
    }

    const pkg = loadModule<MysqlConnection>('mysql/lib/Connection.js');

    if (!pkg) {
      __DEBUG_BUILD__ && logger.error('Mysql Integration was unable to require `mysql` package.');
      return;
    }

    // The original function will have one of these signatures:
    //    function (callback) => void
    //    function (options, callback) => void
    //    function (options, values, callback) => void
    fill(pkg, 'createQuery', function (orig: () => void) {
      return function (this: unknown, options: unknown, values: unknown, callback: unknown) {
        const scope = getCurrentHub().getScope();
        const parentSpan = scope?.getSpan();
        const span = parentSpan?.startChild({
          description: typeof options === 'string' ? options : (options as { sql: string }).sql,
          op: 'db',
        });

        if (typeof callback === 'function') {
          return orig.call(this, options, values, function (err: Error, result: unknown, fields: unknown) {
            span?.finish();
            callback(err, result, fields);
          });
        }

        if (typeof values === 'function') {
          return orig.call(this, options, function (err: Error, result: unknown, fields: unknown) {
            span?.finish();
            values(err, result, fields);
          });
        }

        return orig.call(this, options, values, callback);
      };
    });
  }
}
