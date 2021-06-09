import { Hub } from '@sentry/hub';
import { EventProcessor, Integration } from '@sentry/types';
import { fill, loadModule, logger } from '@sentry/utils';

interface Mysql2Connection {
  createQuery: () => void;
}

/** Tracing integration for node-mysql2 package */
export class Mysql2 implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Mysql2';

  /**
   * @inheritDoc
   */
  public name: string = Mysql2.id;

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    const pkg = loadModule<Mysql2Connection>('mysql2/lib/connection.js');

    if (!pkg) {
      logger.error('Mysql2 Integration was unable to require `mysql2` package.');
      return;
    }

    // The original function will have one of these signatures:
    //    function (callback, config) => void
    //    function (options, callback, config) => void
    //    function (options, values, callback, config) => void
    fill(pkg, 'createQuery', function(orig: () => void) {
      return function(this: unknown, options: unknown, values: unknown, callback: unknown, config: unknown) {
        const scope = getCurrentHub().getScope();
        const parentSpan = scope?.getSpan();
        const span = parentSpan?.startChild({
          description: typeof options === 'string' ? options : (options as { sql: string }).sql,
          op: `db`,
        });

        if (typeof callback === 'function') {
          return orig.call(this, options, values, function(err: Error, result: unknown, fields: unknown) {
            span?.finish();
            callback(err, result, fields);
          }, config);
        }

        if (typeof values === 'function') {
          return orig.call(this, options, function(err: Error, result: unknown, fields: unknown) {
            span?.finish();
            values(err, result, fields, config);
          });
        }

        return orig.call(this, options, values, callback, config);
      };
    });
  }
}
