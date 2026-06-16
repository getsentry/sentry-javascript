/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mysql
 * - Upstream version: @opentelemetry/instrumentation-mysql@0.64.0
 * - Types from the `mysql` package inlined as simplified interfaces
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs, and the connection-pool
 *   metrics / `enhancedDatabaseReporting` option were removed (unused by the Sentry SDK)
 */

import type { Context, Span } from '@opentelemetry/api';
import { context, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import type { SpanAttributes } from '@sentry/core';
import { SDK_VERSION, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan, withActiveSpan } from '@sentry/core';
import type * as mysqlTypes from './mysql-types';
import {
  ATTR_DB_CONNECTION_STRING,
  ATTR_DB_NAME,
  ATTR_DB_STATEMENT,
  ATTR_DB_SYSTEM,
  ATTR_DB_USER,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
  DB_SYSTEM_VALUE_MYSQL,
} from './semconv';
import { getConfig, getDbQueryText, getJDBCString, getSpanName } from './utils';

const PACKAGE_NAME = '@sentry/instrumentation-mysql';
const ORIGIN = 'auto.db.otel.mysql';

type getConnectionCallbackType = (err: mysqlTypes.MysqlError, connection: mysqlTypes.PoolConnection) => void;

export class MySQLInstrumentation extends InstrumentationBase<InstrumentationConfig> {
  public constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition(
        'mysql',
        ['>=2.0.0 <3'],
        (moduleExports: typeof mysqlTypes) => {
          if (isWrapped(moduleExports.createConnection)) {
            this._unwrap(moduleExports, 'createConnection');
          }
          // oxlint-disable-next-line typescript/no-explicit-any
          this._wrap(moduleExports, 'createConnection', this._patchCreateConnection() as any);

          if (isWrapped(moduleExports.createPool)) {
            this._unwrap(moduleExports, 'createPool');
          }
          // oxlint-disable-next-line typescript/no-explicit-any
          this._wrap(moduleExports, 'createPool', this._patchCreatePool() as any);

          if (isWrapped(moduleExports.createPoolCluster)) {
            this._unwrap(moduleExports, 'createPoolCluster');
          }
          // oxlint-disable-next-line typescript/no-explicit-any
          this._wrap(moduleExports, 'createPoolCluster', this._patchCreatePoolCluster() as any);

          return moduleExports;
        },
        (moduleExports: typeof mysqlTypes) => {
          if (moduleExports === undefined) return;
          this._unwrap(moduleExports, 'createConnection');
          this._unwrap(moduleExports, 'createPool');
          this._unwrap(moduleExports, 'createPoolCluster');
        },
      ),
    ];
  }

  // global export function
  private _patchCreateConnection() {
    return (originalCreateConnection: Function) => {
      // oxlint-disable-next-line typescript/no-this-alias
      const thisPlugin = this;

      return function createConnection(_connectionUri: string | mysqlTypes.ConnectionConfig) {
        const originalResult = originalCreateConnection(...arguments);

        // This is unwrapped on next call after unpatch
        // oxlint-disable-next-line typescript/no-explicit-any
        thisPlugin._wrap(originalResult, 'query', thisPlugin._patchQuery(originalResult) as any);

        return originalResult;
      };
    };
  }

  // global export function
  private _patchCreatePool() {
    return (originalCreatePool: Function) => {
      // oxlint-disable-next-line typescript/no-this-alias
      const thisPlugin = this;
      return function createPool(_config: string | mysqlTypes.PoolConfig) {
        const pool = originalCreatePool(...arguments);

        thisPlugin._wrap(pool, 'query', thisPlugin._patchQuery(pool));
        thisPlugin._wrap(pool, 'getConnection', thisPlugin._patchGetConnection(pool));

        return pool;
      };
    };
  }

  // global export function
  private _patchCreatePoolCluster() {
    return (originalCreatePoolCluster: Function) => {
      // oxlint-disable-next-line typescript/no-this-alias
      const thisPlugin = this;
      return function createPool(_config: string | mysqlTypes.PoolConfig) {
        const cluster = originalCreatePoolCluster(...arguments);

        // This is unwrapped on next call after unpatch
        thisPlugin._wrap(cluster, 'getConnection', thisPlugin._patchGetConnection(cluster));

        return cluster;
      };
    };
  }

  // method on cluster or pool
  private _patchGetConnection(pool: mysqlTypes.Pool | mysqlTypes.PoolCluster) {
    return (originalGetConnection: Function) => {
      // oxlint-disable-next-line typescript/no-this-alias
      const thisPlugin = this;

      return function getConnection(arg1?: unknown, arg2?: unknown, arg3?: unknown) {
        // Unwrap if unpatch has been called
        if (!thisPlugin['_enabled']) {
          thisPlugin._unwrap(pool, 'getConnection');
          return originalGetConnection.apply(pool, arguments);
        }

        if (arguments.length === 1 && typeof arg1 === 'function') {
          const patchFn = thisPlugin._getConnectionCallbackPatchFn(arg1 as getConnectionCallbackType);
          return originalGetConnection.call(pool, patchFn);
        }
        if (arguments.length === 2 && typeof arg2 === 'function') {
          const patchFn = thisPlugin._getConnectionCallbackPatchFn(arg2 as getConnectionCallbackType);
          return originalGetConnection.call(pool, arg1, patchFn);
        }
        if (arguments.length === 3 && typeof arg3 === 'function') {
          const patchFn = thisPlugin._getConnectionCallbackPatchFn(arg3 as getConnectionCallbackType);
          return originalGetConnection.call(pool, arg1, arg2, patchFn);
        }

        return originalGetConnection.apply(pool, arguments);
      };
    };
  }

  private _getConnectionCallbackPatchFn(cb: getConnectionCallbackType) {
    // oxlint-disable-next-line typescript/no-this-alias
    const thisPlugin = this;
    const activeContext = context.active();
    return function (this: unknown, err: mysqlTypes.MysqlError, connection: mysqlTypes.PoolConnection) {
      if (connection) {
        // this is the callback passed into a query
        // no need to unwrap
        if (!isWrapped(connection.query)) {
          // oxlint-disable-next-line typescript/no-explicit-any
          thisPlugin._wrap(connection, 'query', thisPlugin._patchQuery(connection) as any);
        }
      }
      if (typeof cb === 'function') {
        context.with(activeContext, cb, this, err, connection);
      }
    };
  }

  private _patchQuery(connection: mysqlTypes.Connection | mysqlTypes.Pool) {
    return (originalQuery: Function) => {
      // oxlint-disable-next-line typescript/no-this-alias
      const thisPlugin = this;

      return function query(
        query: string | mysqlTypes.Query | mysqlTypes.QueryOptions,
        _valuesOrCallback?: unknown[] | mysqlTypes.queryCallback,
        _callback?: mysqlTypes.queryCallback,
      ) {
        if (!thisPlugin['_enabled']) {
          thisPlugin._unwrap(connection, 'query');
          return originalQuery.apply(connection, arguments);
        }

        const { host, port, database, user } = getConfig(connection.config);
        const portNumber = parseInt(String(port), 10);
        const attributes: SpanAttributes = {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_MYSQL,
          [ATTR_DB_CONNECTION_STRING]: getJDBCString(host, port, database),
          [ATTR_DB_NAME]: database,
          [ATTR_DB_USER]: user,
          [ATTR_DB_STATEMENT]: getDbQueryText(query),
          [ATTR_NET_PEER_NAME]: host,
        };
        if (!isNaN(portNumber)) {
          attributes[ATTR_NET_PEER_PORT] = portNumber;
        }

        const span = startInactiveSpan({
          name: getSpanName(query),
          kind: SpanKind.CLIENT,
          attributes,
        });

        const cbIndex = Array.from(arguments).findIndex(arg => typeof arg === 'function');

        const parentContext = context.active();

        if (cbIndex === -1) {
          const streamableQuery: mysqlTypes.Query = withActiveSpan(span, () => {
            return originalQuery.apply(connection, arguments);
          });
          // Ensure events etc. triggered by the query have the correct context
          context.bind(parentContext, streamableQuery);

          return streamableQuery
            .on('error', (err: unknown) => {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: (err as mysqlTypes.MysqlError).message,
              });
            })
            .on('end', () => {
              span.end();
            });
        } else {
          thisPlugin._wrap(arguments, cbIndex, thisPlugin._patchCallbackQuery(span, parentContext));

          return withActiveSpan(span, () => {
            return originalQuery.apply(connection, arguments);
          });
        }
      };
    };
  }

  private _patchCallbackQuery(span: Span, parentContext: Context) {
    return (originalCallback: Function) => {
      return function (err: mysqlTypes.MysqlError | null, _results?: unknown, _fields?: mysqlTypes.FieldInfo[]) {
        if (err) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err.message,
          });
        }
        span.end();
        return context.with(parentContext, () => originalCallback(...arguments));
      };
    };
  }
}
