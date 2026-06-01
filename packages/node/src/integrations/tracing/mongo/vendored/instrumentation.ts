/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mongodb
 * - Upstream version: @opentelemetry/instrumentation-mongodb@0.71.0
 */
/* eslint-disable */

import { context, trace, Span, SpanKind, SpanStatusCode, UpDownCounter, type Attributes } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import { InstrumentationNodeModuleFile } from '../../InstrumentationNodeModuleFile';
import {
  ATTR_DB_COLLECTION_NAME,
  ATTR_DB_NAMESPACE,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_DB_CONNECTION_STRING,
  ATTR_DB_MONGODB_COLLECTION,
  ATTR_DB_NAME,
  ATTR_DB_OPERATION,
  ATTR_DB_STATEMENT,
  ATTR_DB_SYSTEM,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
  DB_SYSTEM_NAME_VALUE_MONGODB,
  DB_SYSTEM_VALUE_MONGODB,
  METRIC_DB_CLIENT_CONNECTIONS_USAGE,
} from './semconv';
import { MongoDBInstrumentationConfig, CommandResult } from './types';
import {
  CursorState,
  ServerSession,
  MongodbCommandType,
  MongoInternalCommand,
  MongodbNamespace,
  MongoInternalTopology,
  WireProtocolInternal,
  V4Connection,
  V4ConnectionPool,
  Replacer,
} from './internal-types';
import { V4Connect, V4Session } from './internal-types';
import { SDK_VERSION } from '@sentry/core';

const PACKAGE_NAME = '@sentry/instrumentation-mongodb';

const DEFAULT_CONFIG: MongoDBInstrumentationConfig = {
  requireParentSpan: true,
};

/** mongodb instrumentation plugin for OpenTelemetry */
export class MongoDBInstrumentation extends InstrumentationBase<MongoDBInstrumentationConfig> {
  private _netSemconvStability!: SemconvStability;
  private _dbSemconvStability!: SemconvStability;
  declare private _connectionsUsage: UpDownCounter;
  declare private _poolName: string;

  constructor(config: MongoDBInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, { ...DEFAULT_CONFIG, ...config });
    this._setSemconvStabilityFromEnv();
  }

  // Used for testing.
  private _setSemconvStabilityFromEnv() {
    this._netSemconvStability = semconvStabilityFromStr('http', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
    this._dbSemconvStability = semconvStabilityFromStr('database', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
  }

  override setConfig(config: MongoDBInstrumentationConfig = {}) {
    super.setConfig({ ...DEFAULT_CONFIG, ...config });
  }

  override _updateMetricInstruments() {
    this._connectionsUsage = this.meter.createUpDownCounter(METRIC_DB_CLIENT_CONNECTIONS_USAGE, {
      description: 'The number of connections that are currently in state described by the state attribute.',
      unit: '{connection}',
    });
  }

  /**
   * Convenience function for updating the `db.client.connections.usage` metric.
   * The name "count" comes from the eventual replacement for this metric per
   * https://opentelemetry.io/docs/specs/semconv/non-normative/db-migration/#database-client-connection-count
   */
  private _connCountAdd(n: number, poolName: string, state: string) {
    this._connectionsUsage?.add(n, { 'pool.name': poolName, state });
  }

  init() {
    const { v3PatchConnection: v3PatchConnection, v3UnpatchConnection: v3UnpatchConnection } =
      this._getV3ConnectionPatches();

    const { v4PatchConnect, v4UnpatchConnect } = this._getV4ConnectPatches();
    const { v4PatchConnectionCallback, v4PatchConnectionPromise, v4UnpatchConnection } = this._getV4ConnectionPatches();
    const { v4PatchConnectionPool, v4UnpatchConnectionPool } = this._getV4ConnectionPoolPatches();
    const { v4PatchSessions, v4UnpatchSessions } = this._getV4SessionsPatches();

    return [
      new InstrumentationNodeModuleDefinition('mongodb', ['>=3.3.0 <4'], undefined, undefined, [
        new InstrumentationNodeModuleFile(
          'mongodb/lib/core/wireprotocol/index.js',
          ['>=3.3.0 <4'],
          v3PatchConnection,
          v3UnpatchConnection,
        ),
      ]),
      new InstrumentationNodeModuleDefinition('mongodb', ['>=4.0.0 <8'], undefined, undefined, [
        new InstrumentationNodeModuleFile(
          'mongodb/lib/cmap/connection.js',
          ['>=4.0.0 <6.4'],
          v4PatchConnectionCallback,
          v4UnpatchConnection,
        ),
        new InstrumentationNodeModuleFile(
          'mongodb/lib/cmap/connection.js',
          ['>=6.4.0 <8'],
          v4PatchConnectionPromise,
          v4UnpatchConnection,
        ),
        new InstrumentationNodeModuleFile(
          'mongodb/lib/cmap/connection_pool.js',
          ['>=4.0.0 <6.4'],
          v4PatchConnectionPool,
          v4UnpatchConnectionPool,
        ),
        new InstrumentationNodeModuleFile(
          'mongodb/lib/cmap/connect.js',
          ['>=4.0.0 <8'],
          v4PatchConnect,
          v4UnpatchConnect,
        ),
        new InstrumentationNodeModuleFile(
          'mongodb/lib/sessions.js',
          ['>=4.0.0 <8'],
          v4PatchSessions,
          v4UnpatchSessions,
        ),
      ]),
    ];
  }

  private _getV3ConnectionPatches<T extends WireProtocolInternal>() {
    return {
      v3PatchConnection: (moduleExports: T) => {
        // patch insert operation
        if (isWrapped(moduleExports.insert)) {
          this._unwrap(moduleExports, 'insert');
        }
        this._wrap(moduleExports, 'insert', this._getV3PatchOperation('insert'));
        // patch remove operation
        if (isWrapped(moduleExports.remove)) {
          this._unwrap(moduleExports, 'remove');
        }
        this._wrap(moduleExports, 'remove', this._getV3PatchOperation('remove'));
        // patch update operation
        if (isWrapped(moduleExports.update)) {
          this._unwrap(moduleExports, 'update');
        }
        this._wrap(moduleExports, 'update', this._getV3PatchOperation('update'));
        // patch other command
        if (isWrapped(moduleExports.command)) {
          this._unwrap(moduleExports, 'command');
        }
        this._wrap(moduleExports, 'command', this._getV3PatchCommand());
        // patch query
        if (isWrapped(moduleExports.query)) {
          this._unwrap(moduleExports, 'query');
        }
        this._wrap(moduleExports, 'query', this._getV3PatchFind());
        // patch get more operation on cursor
        if (isWrapped(moduleExports.getMore)) {
          this._unwrap(moduleExports, 'getMore');
        }
        this._wrap(moduleExports, 'getMore', this._getV3PatchCursor());
        return moduleExports;
      },
      v3UnpatchConnection: (moduleExports?: T) => {
        if (moduleExports === undefined) return;
        this._unwrap(moduleExports, 'insert');
        this._unwrap(moduleExports, 'remove');
        this._unwrap(moduleExports, 'update');
        this._unwrap(moduleExports, 'command');
        this._unwrap(moduleExports, 'query');
        this._unwrap(moduleExports, 'getMore');
      },
    };
  }

  private _getV4SessionsPatches<T extends V4Session>() {
    return {
      v4PatchSessions: (moduleExports: any) => {
        if (isWrapped(moduleExports.acquire)) {
          this._unwrap(moduleExports, 'acquire');
        }
        this._wrap(moduleExports.ServerSessionPool.prototype, 'acquire', this._getV4AcquireCommand());

        if (isWrapped(moduleExports.release)) {
          this._unwrap(moduleExports, 'release');
        }
        this._wrap(moduleExports.ServerSessionPool.prototype, 'release', this._getV4ReleaseCommand());
        return moduleExports;
      },
      v4UnpatchSessions: (moduleExports?: T) => {
        if (moduleExports === undefined) return;
        if (isWrapped(moduleExports.acquire)) {
          this._unwrap(moduleExports, 'acquire');
        }
        if (isWrapped(moduleExports.release)) {
          this._unwrap(moduleExports, 'release');
        }
      },
    };
  }

  private _getV4AcquireCommand() {
    const instrumentation = this;
    return (original: V4Session['acquire']) => {
      return function patchAcquire(this: any) {
        const nSessionsBeforeAcquire = this.sessions.length;
        const session = original.call(this);
        const nSessionsAfterAcquire = this.sessions.length;

        if (nSessionsBeforeAcquire === nSessionsAfterAcquire) {
          //no session in the pool. a new session was created and used
          instrumentation._connCountAdd(1, instrumentation._poolName, 'used');
        } else if (nSessionsBeforeAcquire - 1 === nSessionsAfterAcquire) {
          //a session was already in the pool. remove it from the pool and use it.
          instrumentation._connCountAdd(-1, instrumentation._poolName, 'idle');
          instrumentation._connCountAdd(1, instrumentation._poolName, 'used');
        }
        return session;
      };
    };
  }

  private _getV4ReleaseCommand() {
    const instrumentation = this;
    return (original: V4Session['release']) => {
      return function patchRelease(this: any, session: ServerSession) {
        const cmdPromise = original.call(this, session);

        instrumentation._connCountAdd(-1, instrumentation._poolName, 'used');
        instrumentation._connCountAdd(1, instrumentation._poolName, 'idle');
        return cmdPromise;
      };
    };
  }

  private _getV4ConnectionPoolPatches<T extends V4ConnectionPool>() {
    return {
      v4PatchConnectionPool: (moduleExports: any) => {
        const poolPrototype = moduleExports.ConnectionPool.prototype;

        if (isWrapped(poolPrototype.checkOut)) {
          this._unwrap(poolPrototype, 'checkOut');
        }

        this._wrap(poolPrototype, 'checkOut', this._getV4ConnectionPoolCheckOut());
        return moduleExports;
      },
      v4UnpatchConnectionPool: (moduleExports?: any) => {
        if (moduleExports === undefined) return;

        this._unwrap(moduleExports.ConnectionPool.prototype, 'checkOut');
      },
    };
  }

  private _getV4ConnectPatches<T extends V4Connect>() {
    return {
      v4PatchConnect: (moduleExports: any) => {
        if (isWrapped(moduleExports.connect)) {
          this._unwrap(moduleExports, 'connect');
        }

        this._wrap(moduleExports, 'connect', this._getV4ConnectCommand());
        return moduleExports;
      },
      v4UnpatchConnect: (moduleExports?: T) => {
        if (moduleExports === undefined) return;

        this._unwrap(moduleExports, 'connect');
      },
    };
  }

  // This patch will become unnecessary once
  // https://jira.mongodb.org/browse/NODE-5639 is done.
  private _getV4ConnectionPoolCheckOut() {
    return (original: V4ConnectionPool['checkOut']) => {
      return function patchedCheckout(this: unknown, callback: any) {
        const patchedCallback = context.bind(context.active(), callback);
        return original.call(this, patchedCallback);
      };
    };
  }

  private _getV4ConnectCommand() {
    const instrumentation = this;

    return (original: V4Connect['connectCallback'] | V4Connect['connectPromise']) => {
      return function patchedConnect(this: unknown, options: any, callback: any) {
        // from v6.4 `connect` method only accepts an options param and returns a promise
        // with the connection
        if (original.length === 1) {
          const result = (original as V4Connect['connectPromise']).call(this, options);
          if (result && typeof result.then === 'function') {
            result.then(
              () => instrumentation.setPoolName(options),
              // this handler is set to pass the lint rules
              () => undefined,
            );
          }
          return result;
        }

        // Earlier versions expects a callback param and return void
        const patchedCallback = function (err: any, conn: any) {
          if (err || !conn) {
            callback(err, conn);
            return;
          }
          instrumentation.setPoolName(options);
          callback(err, conn);
        };

        return (original as V4Connect['connectCallback']).call(this, options, patchedCallback);
      };
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _getV4ConnectionPatches<T extends V4Connection>() {
    return {
      v4PatchConnectionCallback: (moduleExports: any) => {
        // patch insert operation
        if (isWrapped(moduleExports.Connection.prototype.command)) {
          this._unwrap(moduleExports.Connection.prototype, 'command');
        }

        this._wrap(moduleExports.Connection.prototype, 'command', this._getV4PatchCommandCallback());
        return moduleExports;
      },
      v4PatchConnectionPromise: (moduleExports: any) => {
        // patch insert operation
        if (isWrapped(moduleExports.Connection.prototype.command)) {
          this._unwrap(moduleExports.Connection.prototype, 'command');
        }

        this._wrap(moduleExports.Connection.prototype, 'command', this._getV4PatchCommandPromise());
        return moduleExports;
      },
      v4UnpatchConnection: (moduleExports?: any) => {
        if (moduleExports === undefined) return;
        this._unwrap(moduleExports.Connection.prototype, 'command');
      },
    };
  }

  /** Creates spans for common operations */
  private _getV3PatchOperation(operationName: 'insert' | 'update' | 'remove') {
    const instrumentation = this;
    return (original: WireProtocolInternal[typeof operationName]) => {
      return function patchedServerCommand(
        this: unknown,
        server: MongoInternalTopology,
        ns: string,
        ops: unknown[],
        options: unknown | Function,
        callback?: Function,
      ) {
        const currentSpan = trace.getSpan(context.active());
        const skipInstrumentation = instrumentation._checkSkipInstrumentation(currentSpan);

        const resultHandler = typeof options === 'function' ? options : callback;
        if (skipInstrumentation || typeof resultHandler !== 'function' || typeof ops !== 'object') {
          if (typeof options === 'function') {
            return original.call(this, server, ns, ops, options);
          } else {
            return original.call(this, server, ns, ops, options, callback);
          }
        }

        const attributes = instrumentation._getV3SpanAttributes(
          ns,
          server,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ops[0] as any,
          operationName,
        );
        const spanName = instrumentation._spanNameFromAttrs(attributes);
        const span = instrumentation.tracer.startSpan(spanName, {
          kind: SpanKind.CLIENT,
          attributes,
        });

        const patchedCallback = instrumentation._patchEnd(span, resultHandler);
        // handle when options is the callback to send the correct number of args
        if (typeof options === 'function') {
          return original.call(this, server, ns, ops, patchedCallback);
        } else {
          return original.call(this, server, ns, ops, options, patchedCallback);
        }
      };
    };
  }

  /** Creates spans for command operation */
  private _getV3PatchCommand() {
    const instrumentation = this;
    return (original: WireProtocolInternal['command']) => {
      return function patchedServerCommand(
        this: unknown,
        server: MongoInternalTopology,
        ns: string,
        cmd: MongoInternalCommand,
        options: unknown | Function,
        callback?: Function,
      ) {
        const currentSpan = trace.getSpan(context.active());
        const skipInstrumentation = instrumentation._checkSkipInstrumentation(currentSpan);

        const resultHandler = typeof options === 'function' ? options : callback;

        if (skipInstrumentation || typeof resultHandler !== 'function' || typeof cmd !== 'object') {
          if (typeof options === 'function') {
            return original.call(this, server, ns, cmd, options);
          } else {
            return original.call(this, server, ns, cmd, options, callback);
          }
        }

        const commandType = MongoDBInstrumentation._getCommandType(cmd);
        const operationName = commandType === MongodbCommandType.UNKNOWN ? undefined : commandType;
        const attributes = instrumentation._getV3SpanAttributes(ns, server, cmd, operationName);
        const spanName = instrumentation._spanNameFromAttrs(attributes);
        const span = instrumentation.tracer.startSpan(spanName, {
          kind: SpanKind.CLIENT,
          attributes,
        });

        const patchedCallback = instrumentation._patchEnd(span, resultHandler);
        // handle when options is the callback to send the correct number of args
        if (typeof options === 'function') {
          return original.call(this, server, ns, cmd, patchedCallback);
        } else {
          return original.call(this, server, ns, cmd, options, patchedCallback);
        }
      };
    };
  }

  /** Creates spans for command operation */
  private _getV4PatchCommandCallback() {
    const instrumentation = this;
    return (original: V4Connection['commandCallback']) => {
      return function patchedV4ServerCommand(
        this: any,
        ns: MongodbNamespace,
        cmd: any,
        options: undefined | unknown,
        callback: any,
      ) {
        const currentSpan = trace.getSpan(context.active());
        const skipInstrumentation = instrumentation._checkSkipInstrumentation(currentSpan);
        const resultHandler = callback;
        const commandType = Object.keys(cmd)[0];

        if (typeof cmd !== 'object' || cmd.ismaster || cmd.hello) {
          return original.call(this, ns, cmd, options, callback);
        }

        let span = undefined;
        if (!skipInstrumentation) {
          const attributes = instrumentation._getV4SpanAttributes(this, ns, cmd, commandType);
          const spanName = instrumentation._spanNameFromAttrs(attributes);
          span = instrumentation.tracer.startSpan(spanName, {
            kind: SpanKind.CLIENT,
            attributes,
          });
        }
        const patchedCallback = instrumentation._patchEnd(span, resultHandler, this.id, commandType);

        return original.call(this, ns, cmd, options, patchedCallback);
      };
    };
  }

  private _getV4PatchCommandPromise() {
    const instrumentation = this;
    return (original: V4Connection['commandPromise']) => {
      return function patchedV4ServerCommand(this: any, ...args: Parameters<V4Connection['commandPromise']>) {
        const [ns, cmd] = args;
        const currentSpan = trace.getSpan(context.active());
        const skipInstrumentation = instrumentation._checkSkipInstrumentation(currentSpan);

        const commandType = Object.keys(cmd)[0];
        const resultHandler = () => undefined;

        if (typeof cmd !== 'object' || cmd.ismaster || cmd.hello) {
          return original.apply(this, args);
        }

        let span = undefined;
        if (!skipInstrumentation) {
          const attributes = instrumentation._getV4SpanAttributes(this, ns, cmd, commandType);
          const spanName = instrumentation._spanNameFromAttrs(attributes);
          span = instrumentation.tracer.startSpan(spanName, {
            kind: SpanKind.CLIENT,
            attributes,
          });
        }

        const patchedCallback = instrumentation._patchEnd(span, resultHandler, this.id, commandType);

        const result = original.apply(this, args);
        result.then(
          (res: any) => patchedCallback(null, res),
          (err: any) => patchedCallback(err),
        );

        return result;
      };
    };
  }

  /** Creates spans for find operation */
  private _getV3PatchFind() {
    const instrumentation = this;
    return (original: WireProtocolInternal['query']) => {
      return function patchedServerCommand(
        this: unknown,
        server: MongoInternalTopology,
        ns: string,
        cmd: MongoInternalCommand,
        cursorState: CursorState,
        options: unknown | Function,
        callback?: Function,
      ) {
        const currentSpan = trace.getSpan(context.active());
        const skipInstrumentation = instrumentation._checkSkipInstrumentation(currentSpan);
        const resultHandler = typeof options === 'function' ? options : callback;

        if (skipInstrumentation || typeof resultHandler !== 'function' || typeof cmd !== 'object') {
          if (typeof options === 'function') {
            return original.call(this, server, ns, cmd, cursorState, options);
          } else {
            return original.call(this, server, ns, cmd, cursorState, options, callback);
          }
        }

        const attributes = instrumentation._getV3SpanAttributes(ns, server, cmd, 'find');
        const spanName = instrumentation._spanNameFromAttrs(attributes);
        const span = instrumentation.tracer.startSpan(spanName, {
          kind: SpanKind.CLIENT,
          attributes,
        });

        const patchedCallback = instrumentation._patchEnd(span, resultHandler);
        // handle when options is the callback to send the correct number of args
        if (typeof options === 'function') {
          return original.call(this, server, ns, cmd, cursorState, patchedCallback);
        } else {
          return original.call(this, server, ns, cmd, cursorState, options, patchedCallback);
        }
      };
    };
  }

  /** Creates spans for find operation */
  private _getV3PatchCursor() {
    const instrumentation = this;
    return (original: WireProtocolInternal['getMore']) => {
      return function patchedServerCommand(
        this: unknown,
        server: MongoInternalTopology,
        ns: string,
        cursorState: CursorState,
        batchSize: number,
        options: unknown | Function,
        callback?: Function,
      ) {
        const currentSpan = trace.getSpan(context.active());
        const skipInstrumentation = instrumentation._checkSkipInstrumentation(currentSpan);

        const resultHandler = typeof options === 'function' ? options : callback;

        if (skipInstrumentation || typeof resultHandler !== 'function') {
          if (typeof options === 'function') {
            return original.call(this, server, ns, cursorState, batchSize, options);
          } else {
            return original.call(this, server, ns, cursorState, batchSize, options, callback);
          }
        }

        const attributes = instrumentation._getV3SpanAttributes(ns, server, cursorState.cmd, 'getMore');
        const spanName = instrumentation._spanNameFromAttrs(attributes);
        const span = instrumentation.tracer.startSpan(spanName, {
          kind: SpanKind.CLIENT,
          attributes,
        });

        const patchedCallback = instrumentation._patchEnd(span, resultHandler);
        // handle when options is the callback to send the correct number of args
        if (typeof options === 'function') {
          return original.call(this, server, ns, cursorState, batchSize, patchedCallback);
        } else {
          return original.call(this, server, ns, cursorState, batchSize, options, patchedCallback);
        }
      };
    };
  }

  /**
   * Get the mongodb command type from the object.
   * @param command Internal mongodb command object
   */
  private static _getCommandType(command: MongoInternalCommand): MongodbCommandType {
    if (command.createIndexes !== undefined) {
      return MongodbCommandType.CREATE_INDEXES;
    } else if (command.findandmodify !== undefined) {
      return MongodbCommandType.FIND_AND_MODIFY;
    } else if (command.ismaster !== undefined) {
      return MongodbCommandType.IS_MASTER;
    } else if (command.count !== undefined) {
      return MongodbCommandType.COUNT;
    } else if (command.aggregate !== undefined) {
      return MongodbCommandType.AGGREGATE;
    } else {
      return MongodbCommandType.UNKNOWN;
    }
  }

  /**
   * Determine a span's attributes by fetching related metadata from the context
   * @param connectionCtx mongodb internal connection context
   * @param ns mongodb namespace
   * @param command mongodb internal representation of a command
   */
  private _getV4SpanAttributes(
    connectionCtx: any,
    ns: MongodbNamespace,
    command?: any,
    operation?: string,
  ): Attributes {
    let host, port: undefined | string;
    if (connectionCtx) {
      const hostParts = typeof connectionCtx.address === 'string' ? connectionCtx.address.split(':') : '';
      if (hostParts.length === 2) {
        host = hostParts[0];
        port = hostParts[1];
      }
    }
    // capture parameters within the query as well if enhancedDatabaseReporting is enabled.
    let commandObj: Record<string, unknown>;
    if (command?.documents && command.documents[0]) {
      commandObj = command.documents[0];
    } else if (command?.cursors) {
      commandObj = command.cursors;
    } else {
      commandObj = command;
    }

    return this._getSpanAttributes(ns.db, ns.collection, host, port, commandObj, operation);
  }

  /**
   * Determine a span's attributes by fetching related metadata from the context
   * @param ns mongodb namespace
   * @param topology mongodb internal representation of the network topology
   * @param command mongodb internal representation of a command
   */
  private _getV3SpanAttributes(
    ns: string,
    topology: MongoInternalTopology,
    command?: MongoInternalCommand,
    operation?: string | undefined,
  ): Attributes {
    // Extract host/port info.
    let host: undefined | string;
    let port: undefined | string;
    if (topology && topology.s) {
      host = topology.s.options?.host ?? topology.s.host;
      port = (topology.s.options?.port ?? topology.s.port)?.toString();
      if (host == null || port == null) {
        const address = topology.description?.address;
        if (address) {
          const addressSegments = address.split(':');
          host = addressSegments[0];
          port = addressSegments[1];
        }
      }
    }

    // The namespace is a combination of the database name and the name of the
    // collection or index, like so: [database-name].[collection-or-index-name].
    // It could be a string or an instance of MongoDBNamespace, as such we
    // always coerce to a string to extract db and collection.
    const [dbName, dbCollection] = ns.toString().split('.');
    // capture parameters within the query as well if enhancedDatabaseReporting is enabled.
    const commandObj = command?.query ?? command?.q ?? command;

    return this._getSpanAttributes(dbName, dbCollection, host, port, commandObj, operation);
  }

  private _getSpanAttributes(
    dbName?: string,
    dbCollection?: string,
    host?: undefined | string,
    port?: undefined | string,
    commandObj?: any,
    operation?: string | undefined,
  ): Attributes {
    const attributes: Attributes = {};

    if (this._dbSemconvStability & SemconvStability.OLD) {
      attributes[ATTR_DB_SYSTEM] = DB_SYSTEM_VALUE_MONGODB;
      attributes[ATTR_DB_NAME] = dbName;
      attributes[ATTR_DB_MONGODB_COLLECTION] = dbCollection;
      attributes[ATTR_DB_OPERATION] = operation;
      attributes[ATTR_DB_CONNECTION_STRING] = `mongodb://${host}:${port}/${dbName}`;
    }
    if (this._dbSemconvStability & SemconvStability.STABLE) {
      attributes[ATTR_DB_SYSTEM_NAME] = DB_SYSTEM_NAME_VALUE_MONGODB;
      attributes[ATTR_DB_NAMESPACE] = dbName;
      attributes[ATTR_DB_OPERATION_NAME] = operation;
      attributes[ATTR_DB_COLLECTION_NAME] = dbCollection;
    }

    if (host && port) {
      if (this._netSemconvStability & SemconvStability.OLD) {
        attributes[ATTR_NET_PEER_NAME] = host;
      }
      if (this._netSemconvStability & SemconvStability.STABLE) {
        attributes[ATTR_SERVER_ADDRESS] = host;
      }
      const portNumber = parseInt(port, 10);
      if (!isNaN(portNumber)) {
        if (this._netSemconvStability & SemconvStability.OLD) {
          attributes[ATTR_NET_PEER_PORT] = portNumber;
        }
        if (this._netSemconvStability & SemconvStability.STABLE) {
          attributes[ATTR_SERVER_PORT] = portNumber;
        }
      }
    }

    if (commandObj) {
      const { dbStatementSerializer: configDbStatementSerializer } = this.getConfig();
      const dbStatementSerializer =
        typeof configDbStatementSerializer === 'function'
          ? configDbStatementSerializer
          : this._defaultDbStatementSerializer.bind(this);

      safeExecuteInTheMiddle(
        () => {
          const query = dbStatementSerializer(commandObj);
          if (this._dbSemconvStability & SemconvStability.OLD) {
            attributes[ATTR_DB_STATEMENT] = query;
          }
          if (this._dbSemconvStability & SemconvStability.STABLE) {
            attributes[ATTR_DB_QUERY_TEXT] = query;
          }
        },
        err => {
          if (err) {
            this._diag.error('Error running dbStatementSerializer hook', err);
          }
        },
        true,
      );
    }

    return attributes;
  }

  private _spanNameFromAttrs(attributes: Attributes): string {
    let spanName;
    if (this._dbSemconvStability & SemconvStability.STABLE) {
      // https://opentelemetry.io/docs/specs/semconv/database/database-spans/#name
      spanName =
        [attributes[ATTR_DB_OPERATION_NAME], attributes[ATTR_DB_COLLECTION_NAME]].filter(attr => attr).join(' ') ||
        DB_SYSTEM_NAME_VALUE_MONGODB;
    } else {
      spanName = `mongodb.${attributes[ATTR_DB_OPERATION] || 'command'}`;
    }
    return spanName;
  }

  private _getDefaultDbStatementReplacer(): Replacer {
    const seen = new WeakSet();
    return (_key, value) => {
      // undefined, boolean, number, bigint, string, symbol, function || null
      if (typeof value !== 'object' || !value) return '?';

      // objects (including arrays)
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
      return value;
    };
  }

  private _defaultDbStatementSerializer(commandObj: Record<string, unknown>) {
    const { enhancedDatabaseReporting } = this.getConfig();

    if (enhancedDatabaseReporting) {
      return JSON.stringify(commandObj);
    }

    return JSON.stringify(commandObj, this._getDefaultDbStatementReplacer());
  }

  /**
   * Triggers the response hook in case it is defined.
   * @param span The span to add the results to.
   * @param result The command result
   */
  private _handleExecutionResult(span: Span, result: CommandResult) {
    const { responseHook } = this.getConfig();
    if (typeof responseHook === 'function') {
      safeExecuteInTheMiddle(
        () => {
          responseHook(span, { data: result });
        },
        err => {
          if (err) {
            this._diag.error('Error running response hook', err);
          }
        },
        true,
      );
    }
  }

  /**
   * Ends a created span.
   * @param span The created span to end.
   * @param resultHandler A callback function.
   * @param connectionId: The connection ID of the Command response.
   */
  private _patchEnd(
    span: Span | undefined,
    resultHandler: Function,
    connectionId?: number,
    commandType?: string,
  ): Function {
    // mongodb is using "tick" when calling a callback, this way the context
    // in final callback (resultHandler) is lost
    const activeContext = context.active();
    const instrumentation = this;
    let spanEnded = false;

    return function patchedEnd(this: {}, ...args: unknown[]) {
      if (!spanEnded) {
        spanEnded = true;
        const error = args[0];
        if (span) {
          if (error instanceof Error) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
          } else {
            const result = args[1] as CommandResult;
            instrumentation._handleExecutionResult(span, result);
          }
          span.end();
        }

        if (commandType === 'endSessions') {
          instrumentation._connCountAdd(-1, instrumentation._poolName, 'idle');
        }
      }

      return context.with(activeContext, () => {
        return resultHandler.apply(this, args);
      });
    };
  }
  private setPoolName(options: any) {
    const host = options.hostAddress?.host;
    const port = options.hostAddress?.port;
    const database = options.dbName;
    const poolName = `mongodb://${host}:${port}/${database}`;
    this._poolName = poolName;
  }

  private _checkSkipInstrumentation(currentSpan: Span | undefined) {
    const requireParentSpan = this.getConfig().requireParentSpan;
    const hasNoParentSpan = currentSpan === undefined;
    return requireParentSpan === true && hasNoParentSpan;
  }
}
