/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mysql
 * - Upstream version: @opentelemetry/instrumentation-mysql@0.64.0
 * - Types from the `mysql` package inlined as simplified interfaces
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 */
/* eslint-disable */

import { context, Context, trace, Span, SpanKind, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import { DB_SYSTEM_NAME_VALUE_MYSQL } from '@opentelemetry/semantic-conventions';
import {
  DB_NAME,
  DB_NAMESPACE,
  DB_QUERY_TEXT,
  DB_STATEMENT,
  DB_SYSTEM,
  DB_SYSTEM_NAME,
  DB_USER,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import {
  ATTR_DB_CONNECTION_STRING,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
  DB_SYSTEM_VALUE_MYSQL,
  METRIC_DB_CLIENT_CONNECTIONS_USAGE,
} from './semconv';
import type * as mysqlTypes from './mysql-types';
import { AttributeNames } from './AttributeNames';
import { MySQLInstrumentationConfig } from './types';
import { getConfig, getDbQueryText, getDbValues, getJDBCString, getSpanName, getPoolNameOld } from './utils';
import { SDK_VERSION } from '@sentry/core';
import { UpDownCounter } from '@opentelemetry/api';

const PACKAGE_NAME = '@sentry/instrumentation-mysql';

type getConnectionCallbackType = (err: mysqlTypes.MysqlError, connection: mysqlTypes.PoolConnection) => void;

export class MySQLInstrumentation extends InstrumentationBase<MySQLInstrumentationConfig> {
  private _netSemconvStability!: SemconvStability;
  private _dbSemconvStability!: SemconvStability;
  declare private _connectionsUsageOld: UpDownCounter;

  constructor(config: MySQLInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
    this._setSemconvStabilityFromEnv();
  }

  // Used for testing.
  private _setSemconvStabilityFromEnv() {
    this._netSemconvStability = semconvStabilityFromStr('http', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
    this._dbSemconvStability = semconvStabilityFromStr('database', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
  }

  protected override _updateMetricInstruments() {
    this._connectionsUsageOld = this.meter.createUpDownCounter(METRIC_DB_CLIENT_CONNECTIONS_USAGE, {
      description: 'The number of connections that are currently in state described by the state attribute.',
      unit: '{connection}',
    });
  }

  /**
   * Convenience function for updating the `db.client.connections.usage` metric.
   * The name "count" comes from the eventually replacement for this metric per
   * https://opentelemetry.io/docs/specs/semconv/non-normative/db-migration/#database-client-connection-count
   */
  private _connCountAdd(n: number, poolNameOld: string, state: string) {
    this._connectionsUsageOld?.add(n, { state, name: poolNameOld });
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
          this._wrap(moduleExports, 'createConnection', this._patchCreateConnection() as any);

          if (isWrapped(moduleExports.createPool)) {
            this._unwrap(moduleExports, 'createPool');
          }
          this._wrap(moduleExports, 'createPool', this._patchCreatePool() as any);

          if (isWrapped(moduleExports.createPoolCluster)) {
            this._unwrap(moduleExports, 'createPoolCluster');
          }
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
      const thisPlugin = this;

      return function createConnection(_connectionUri: string | mysqlTypes.ConnectionConfig) {
        const originalResult = originalCreateConnection(...arguments);

        // This is unwrapped on next call after unpatch
        thisPlugin._wrap(originalResult, 'query', thisPlugin._patchQuery(originalResult) as any);

        return originalResult;
      };
    };
  }

  // global export function
  private _patchCreatePool() {
    return (originalCreatePool: Function) => {
      const thisPlugin = this;
      return function createPool(_config: string | mysqlTypes.PoolConfig) {
        const pool = originalCreatePool(...arguments);

        thisPlugin._wrap(pool, 'query', thisPlugin._patchQuery(pool));
        thisPlugin._wrap(pool, 'getConnection', thisPlugin._patchGetConnection(pool));
        thisPlugin._wrap(pool, 'end', thisPlugin._patchPoolEnd(pool));
        thisPlugin._setPoolCallbacks(pool, '');

        return pool;
      };
    };
  }

  private _patchPoolEnd(pool: any) {
    return (originalPoolEnd: Function) => {
      const thisPlugin = this;
      return function end(callback?: unknown) {
        const nAll = (pool as any)._allConnections.length;
        const nFree = (pool as any)._freeConnections.length;
        const nUsed = nAll - nFree;
        const poolNameOld = getPoolNameOld(pool);
        thisPlugin._connCountAdd(-nUsed, poolNameOld, 'used');
        thisPlugin._connCountAdd(-nFree, poolNameOld, 'idle');
        originalPoolEnd.apply(pool, arguments);
      };
    };
  }

  // global export function
  private _patchCreatePoolCluster() {
    return (originalCreatePoolCluster: Function) => {
      const thisPlugin = this;
      return function createPool(_config: string | mysqlTypes.PoolConfig) {
        const cluster = originalCreatePoolCluster(...arguments);

        // This is unwrapped on next call after unpatch
        thisPlugin._wrap(cluster, 'getConnection', thisPlugin._patchGetConnection(cluster));
        thisPlugin._wrap(cluster, 'add', thisPlugin._patchAdd(cluster));

        return cluster;
      };
    };
  }
  private _patchAdd(cluster: mysqlTypes.PoolCluster) {
    return (originalAdd: Function) => {
      const thisPlugin = this;
      return function add(id: string, config: unknown) {
        // Unwrap if unpatch has been called
        if (!thisPlugin['_enabled']) {
          thisPlugin._unwrap(cluster, 'add');
          return originalAdd.apply(cluster, arguments);
        }
        originalAdd.apply(cluster, arguments);
        const nodes = cluster['_nodes' as keyof mysqlTypes.PoolCluster] as any;
        if (nodes) {
          const nodeId = typeof id === 'object' ? 'CLUSTER::' + (cluster as any)._lastId : String(id);

          const pool = nodes[nodeId].pool;
          thisPlugin._setPoolCallbacks(pool, id);
        }
      };
    };
  }

  // method on cluster or pool
  private _patchGetConnection(pool: mysqlTypes.Pool | mysqlTypes.PoolCluster) {
    return (originalGetConnection: Function) => {
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
    const thisPlugin = this;
    const activeContext = context.active();
    return function (this: any, err: mysqlTypes.MysqlError, connection: mysqlTypes.PoolConnection) {
      if (connection) {
        // this is the callback passed into a query
        // no need to unwrap
        if (!isWrapped(connection.query)) {
          thisPlugin._wrap(connection, 'query', thisPlugin._patchQuery(connection));
        }
      }
      if (typeof cb === 'function') {
        context.with(activeContext, cb, this, err, connection);
      }
    };
  }

  private _patchQuery(connection: mysqlTypes.Connection | mysqlTypes.Pool) {
    return (originalQuery: Function): mysqlTypes.QueryFunction => {
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

        const attributes: Attributes = {};
        const { host, port, database, user } = getConfig(connection.config);
        const portNumber = parseInt(port, 10);
        const dbQueryText = getDbQueryText(query);
        if (thisPlugin._dbSemconvStability & SemconvStability.OLD) {
          attributes[DB_SYSTEM] = DB_SYSTEM_VALUE_MYSQL;
          attributes[ATTR_DB_CONNECTION_STRING] = getJDBCString(host, port, database);
          attributes[DB_NAME] = database;
          attributes[DB_USER] = user;
          attributes[DB_STATEMENT] = dbQueryText;
        }
        if (thisPlugin._dbSemconvStability & SemconvStability.STABLE) {
          attributes[DB_SYSTEM_NAME] = DB_SYSTEM_NAME_VALUE_MYSQL;
          attributes[DB_NAMESPACE] = database;
          attributes[DB_QUERY_TEXT] = dbQueryText;
        }
        if (thisPlugin._netSemconvStability & SemconvStability.OLD) {
          attributes[ATTR_NET_PEER_NAME] = host;
          if (!isNaN(portNumber)) {
            attributes[ATTR_NET_PEER_PORT] = portNumber;
          }
        }
        if (thisPlugin._netSemconvStability & SemconvStability.STABLE) {
          attributes[SERVER_ADDRESS] = host;
          if (!isNaN(portNumber)) {
            attributes[SERVER_PORT] = portNumber;
          }
        }
        const span = thisPlugin.tracer.startSpan(getSpanName(query), {
          kind: SpanKind.CLIENT,
          attributes,
        });

        if (thisPlugin.getConfig().enhancedDatabaseReporting) {
          let values;

          if (Array.isArray(_valuesOrCallback)) {
            values = _valuesOrCallback;
          } else if (arguments[2]) {
            values = [_valuesOrCallback];
          }

          span.setAttribute(AttributeNames.MYSQL_VALUES, getDbValues(query, values));
        }

        const cbIndex = Array.from(arguments).findIndex(arg => typeof arg === 'function');

        const parentContext = context.active();

        if (cbIndex === -1) {
          const streamableQuery: mysqlTypes.Query = context.with(trace.setSpan(context.active(), span), () => {
            return originalQuery.apply(connection, arguments);
          });
          context.bind(parentContext, streamableQuery);

          return streamableQuery
            .on('error', err =>
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: err.message,
              }),
            )
            .on('end', () => {
              span.end();
            });
        } else {
          thisPlugin._wrap(arguments, cbIndex, thisPlugin._patchCallbackQuery(span, parentContext));

          return context.with(trace.setSpan(context.active(), span), () => {
            return originalQuery.apply(connection, arguments);
          });
        }
      };
    };
  }

  private _patchCallbackQuery(span: Span, parentContext: Context) {
    return (originalCallback: Function) => {
      return function (err: mysqlTypes.MysqlError | null, results?: any, fields?: mysqlTypes.FieldInfo[]) {
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

  private _setPoolCallbacks(pool: mysqlTypes.Pool, id: string) {
    const poolNameOld = id || getPoolNameOld(pool);

    pool.on('connection', _connection => {
      this._connCountAdd(1, poolNameOld, 'idle');
    });

    pool.on('acquire', _connection => {
      this._connCountAdd(-1, poolNameOld, 'idle');
      this._connCountAdd(1, poolNameOld, 'used');
    });

    pool.on('release', _connection => {
      this._connCountAdd(1, poolNameOld, 'idle');
      this._connCountAdd(-1, poolNameOld, 'used');
    });
  }
}
