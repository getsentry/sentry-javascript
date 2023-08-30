import type { Hub } from '@sentry/core';
import type { EventProcessor } from '@sentry/types';
import { fill, isThenable, loadModule, logger } from '@sentry/utils';

import type { LazyLoadedIntegration } from './lazy';
import { shouldDisableAutoInstrumentation } from './utils/node-utils';

interface PgClient {
  prototype: {
    query: () => void | Promise<unknown>;
  };
}

interface PgClientThis {
  database?: string;
  host?: string;
  port?: number;
  user?: string;
}

interface PgOptions {
  usePgNative?: boolean;
}

type PGModule = { Client: PgClient; native: { Client: PgClient } };

/** Tracing integration for node-postgres package */
export class Postgres implements LazyLoadedIntegration<PGModule> {
  /**
   * @inheritDoc
   */
  public static id: string = 'Postgres';

  /**
   * @inheritDoc
   */
  public name: string;

  private _usePgNative: boolean;

  private _module?: PGModule;

  public constructor(options: PgOptions = {}) {
    this.name = Postgres.id;
    this._usePgNative = !!options.usePgNative;
  }

  /** @inheritdoc */
  public loadDependency(): PGModule | undefined {
    return (this._module = this._module || loadModule('pg'));
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (shouldDisableAutoInstrumentation(getCurrentHub)) {
      __DEBUG_BUILD__ && logger.log('Postgres Integration is skipped because of instrumenter configuration.');
      return;
    }

    const pkg = this.loadDependency();

    if (!pkg) {
      __DEBUG_BUILD__ && logger.error('Postgres Integration was unable to require `pg` package.');
      return;
    }

    if (this._usePgNative && !pkg.native?.Client) {
      __DEBUG_BUILD__ && logger.error("Postgres Integration was unable to access 'pg-native' bindings.");
      return;
    }

    const { Client } = this._usePgNative ? pkg.native : pkg;

    /**
     * function (query, callback) => void
     * function (query, params, callback) => void
     * function (query) => Promise
     * function (query, params) => Promise
     * function (pg.Cursor) => pg.Cursor
     */
    fill(Client.prototype, 'query', function (orig: () => void | Promise<unknown>) {
      return function (this: PgClientThis, config: unknown, values: unknown, callback: unknown) {
        const scope = getCurrentHub().getScope();
        const parentSpan = scope?.getSpan();

        const data: Record<string, string | number> = {
          'db.system': 'postgresql',
        };

        try {
          if (this.database) {
            data['db.name'] = this.database;
          }
          if (this.host) {
            data['server.address'] = this.host;
          }
          if (this.port) {
            data['server.port'] = this.port;
          }
          if (this.user) {
            data['db.user'] = this.user;
          }
        } catch (e) {
          // ignore
        }

        const span = parentSpan?.startChild({
          description: typeof config === 'string' ? config : (config as { text: string }).text,
          op: 'db',
          origin: 'auto.db.postgres',
          data,
        });

        if (typeof callback === 'function') {
          return orig.call(this, config, values, function (err: Error, result: unknown) {
            span?.finish();
            callback(err, result);
          });
        }

        if (typeof values === 'function') {
          return orig.call(this, config, function (err: Error, result: unknown) {
            span?.finish();
            values(err, result);
          });
        }

        const rv = typeof values !== 'undefined' ? orig.call(this, config, values) : orig.call(this, config);

        if (isThenable(rv)) {
          return rv.then((res: unknown) => {
            span?.finish();
            return res;
          });
        }

        span?.finish();
        return rv;
      };
    });
  }
}
