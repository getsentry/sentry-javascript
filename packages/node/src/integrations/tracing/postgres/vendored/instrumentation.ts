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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-pg
 * - Upstream version: @opentelemetry/instrumentation-pg@0.70.0
 * - Types from `pg` and `pg-pool` packages inlined as simplified interfaces
 * - Minor TypeScript strictness adjustments
 */
/* eslint-disable */

import {
  isWrapped,
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
  InstrumentationNodeModuleFile,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import {
  context,
  trace,
  Span,
  SpanStatusCode,
  SpanKind,
  Histogram,
  ValueType,
  Attributes,
  HrTime,
  UpDownCounter,
} from '@opentelemetry/api';
import type { PgClient } from './pg-types';
import type { PgPool } from './pg-pool-types';
import {
  PgClientConnect,
  PgClientExtended,
  PostgresCallback,
  PgPoolExtended,
  PgPoolCallback,
  EVENT_LISTENERS_SET,
} from './internal-types';
import { PgInstrumentationConfig } from './types';
import * as utils from './utils';
import { addSqlCommenterComment } from '@opentelemetry/sql-common';
import { SDK_VERSION } from '@sentry/core';
const PACKAGE_NAME = '@sentry/instrumentation-pg';
import { SpanNames } from './enums/SpanNames';
import { hrTime, hrTimeDuration, hrTimeToMilliseconds } from '@opentelemetry/core';
import {
  ATTR_ERROR_TYPE,
  ATTR_SERVER_PORT,
  ATTR_SERVER_ADDRESS,
  ATTR_DB_NAMESPACE,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_SYSTEM_NAME,
  METRIC_DB_CLIENT_OPERATION_DURATION,
} from '@opentelemetry/semantic-conventions';
import {
  METRIC_DB_CLIENT_CONNECTION_COUNT,
  METRIC_DB_CLIENT_CONNECTION_PENDING_REQUESTS,
  ATTR_DB_SYSTEM,
  DB_SYSTEM_VALUE_POSTGRESQL,
} from './semconv';

function extractModuleExports(module: any) {
  return module[Symbol.toStringTag] === 'Module'
    ? module.default // ESM
    : module; // CommonJS
}

export class PgInstrumentation extends InstrumentationBase<PgInstrumentationConfig> {
  declare private _operationDuration: Histogram;
  declare private _connectionsCount: UpDownCounter;
  declare private _connectionPendingRequests: UpDownCounter;
  // Pool events connect, acquire, release and remove can be called
  // multiple times without changing the values of total, idle and waiting
  // connections. The _connectionsCounter is used to keep track of latest
  // values and only update the metrics _connectionsCount and _connectionPendingRequests
  // when the value change.
  private _connectionsCounter: utils.poolConnectionsCounter = {
    used: 0,
    idle: 0,
    pending: 0,
  };
  private _semconvStability: SemconvStability;

  constructor(config: PgInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
    this._semconvStability = semconvStabilityFromStr('database', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
  }

  override _updateMetricInstruments() {
    this._operationDuration = this.meter.createHistogram(METRIC_DB_CLIENT_OPERATION_DURATION, {
      description: 'Duration of database client operations.',
      unit: 's',
      valueType: ValueType.DOUBLE,
      advice: {
        explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
      },
    });

    this._connectionsCounter = {
      idle: 0,
      pending: 0,
      used: 0,
    };
    this._connectionsCount = this.meter.createUpDownCounter(METRIC_DB_CLIENT_CONNECTION_COUNT, {
      description: 'The number of connections that are currently in state described by the state attribute.',
      unit: '{connection}',
    });
    this._connectionPendingRequests = this.meter.createUpDownCounter(METRIC_DB_CLIENT_CONNECTION_PENDING_REQUESTS, {
      description: 'The number of current pending requests for an open connection.',
      unit: '{connection}',
    });
  }

  protected init() {
    const SUPPORTED_PG_VERSIONS = ['>=8.0.3 <9'];
    const SUPPORTED_PG_POOL_VERSIONS = ['>=2.0.0 <4'];

    const modulePgNativeClient = new InstrumentationNodeModuleFile(
      'pg/lib/native/client.js',
      SUPPORTED_PG_VERSIONS,
      this._patchPgClient.bind(this),
      this._unpatchPgClient.bind(this),
    );

    const modulePgClient = new InstrumentationNodeModuleFile(
      'pg/lib/client.js',
      SUPPORTED_PG_VERSIONS,
      this._patchPgClient.bind(this),
      this._unpatchPgClient.bind(this),
    );

    const modulePG = new InstrumentationNodeModuleDefinition(
      'pg',
      SUPPORTED_PG_VERSIONS,
      (module: any) => {
        const moduleExports = extractModuleExports(module);

        this._patchPgClient(moduleExports.Client);
        return module;
      },
      (module: any) => {
        const moduleExports = extractModuleExports(module);

        this._unpatchPgClient(moduleExports.Client);
        return module;
      },
      [modulePgClient, modulePgNativeClient],
    );

    const modulePGPool = new InstrumentationNodeModuleDefinition(
      'pg-pool',
      SUPPORTED_PG_POOL_VERSIONS,
      (module: any) => {
        const moduleExports = extractModuleExports(module);
        if (isWrapped(moduleExports.prototype.connect)) {
          this._unwrap(moduleExports.prototype, 'connect');
        }
        this._wrap(moduleExports.prototype, 'connect', this._getPoolConnectPatch() as any);
        return moduleExports;
      },
      (module: any) => {
        const moduleExports = extractModuleExports(module);
        if (isWrapped(moduleExports.prototype.connect)) {
          this._unwrap(moduleExports.prototype, 'connect');
        }
      },
    );

    return [modulePG, modulePGPool];
  }

  private _patchPgClient(module: any) {
    if (!module) {
      return;
    }

    const moduleExports = extractModuleExports(module);

    if (isWrapped(moduleExports.prototype.query)) {
      this._unwrap(moduleExports.prototype, 'query');
    }

    if (isWrapped(moduleExports.prototype.connect)) {
      this._unwrap(moduleExports.prototype, 'connect');
    }

    this._wrap(moduleExports.prototype, 'query', this._getClientQueryPatch() as any);

    this._wrap(moduleExports.prototype, 'connect', this._getClientConnectPatch() as any);

    return module;
  }

  private _unpatchPgClient(module: any) {
    const moduleExports = extractModuleExports(module);

    if (isWrapped(moduleExports.prototype.query)) {
      this._unwrap(moduleExports.prototype, 'query');
    }

    if (isWrapped(moduleExports.prototype.connect)) {
      this._unwrap(moduleExports.prototype, 'connect');
    }

    return module;
  }

  private _getClientConnectPatch() {
    const plugin = this;
    return (original: PgClientConnect) => {
      return function connect(this: PgClient, callback?: Function) {
        const config = plugin.getConfig();

        if (utils.shouldSkipInstrumentation(config) || config.ignoreConnectSpans) {
          return original.call(this, callback);
        }

        const span = plugin.tracer.startSpan(SpanNames.CONNECT, {
          kind: SpanKind.CLIENT,
          attributes: utils.getSemanticAttributesFromConnection(
            (this as any).connectionParameters ?? this,
            plugin._semconvStability,
          ),
        });

        if (callback) {
          const parentSpan = trace.getSpan(context.active());
          callback = utils.patchClientConnectCallback(span, callback);
          if (parentSpan) {
            callback = context.bind(context.active(), callback);
          }
        }

        const connectResult: unknown = context.with(trace.setSpan(context.active(), span), () => {
          return original.call(this, callback);
        });

        return handleConnectResult(span, connectResult);
      };
    };
  }

  private recordOperationDuration(attributes: Attributes, startTime: HrTime) {
    const metricsAttributes: Attributes = {};
    const keysToCopy: string[] = [
      ATTR_DB_NAMESPACE,
      ATTR_ERROR_TYPE,
      ATTR_SERVER_PORT,
      ATTR_SERVER_ADDRESS,
      ATTR_DB_OPERATION_NAME,
    ];
    if (this._semconvStability & SemconvStability.OLD) {
      keysToCopy.push(ATTR_DB_SYSTEM);
    }
    if (this._semconvStability & SemconvStability.STABLE) {
      keysToCopy.push(ATTR_DB_SYSTEM_NAME);
    }

    keysToCopy.forEach(key => {
      if (key in attributes) {
        metricsAttributes[key] = attributes[key];
      }
    });

    const durationSeconds = hrTimeToMilliseconds(hrTimeDuration(startTime, hrTime())) / 1000;
    this._operationDuration.record(durationSeconds, metricsAttributes);
  }

  private _getClientQueryPatch() {
    const plugin = this;
    return (original: (...args: any[]) => any) => {
      this._diag.debug('Patching pg.Client.prototype.query');
      return function query(this: PgClientExtended, ...args: unknown[]) {
        if (utils.shouldSkipInstrumentation(plugin.getConfig())) {
          return original.apply(this, args as never);
        }
        const startTime = hrTime();

        // client.query(text, cb?), client.query(text, values, cb?), and
        // client.query(configObj, cb?) are all valid signatures. We construct
        // a queryConfig obj from all (valid) signatures to build the span in a
        // unified way. We verify that we at least have query text, and code
        // defensively when dealing with `queryConfig` after that (to handle all
        // the other invalid cases, like a non-array for values being provided).
        // The type casts here reflect only what we've actually validated.
        const arg0 = args[0];
        const firstArgIsString = typeof arg0 === 'string';
        const firstArgIsQueryObjectWithText = utils.isObjectWithTextString(arg0);

        // TODO: remove the `as ...` casts below when the TS version is upgraded.
        // Newer TS versions will use the result of firstArgIsQueryObjectWithText
        // to properly narrow arg0, but TS 4.3.5 does not.
        const queryConfig = firstArgIsString
          ? {
              text: arg0 as string,
              values: Array.isArray(args[1]) ? args[1] : undefined,
            }
          : firstArgIsQueryObjectWithText
            ? {
                ...(arg0 as any),
                name: arg0.name,
                text: arg0.text,
                values: (arg0 as any).values ?? (Array.isArray(args[1]) ? args[1] : undefined),
              }
            : undefined;

        const attributes: Attributes = {
          [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_POSTGRESQL,
          [ATTR_DB_NAMESPACE]: this.database,
          [ATTR_SERVER_PORT]: this.connectionParameters.port,
          [ATTR_SERVER_ADDRESS]: this.connectionParameters.host,
        };

        if (queryConfig?.text) {
          attributes[ATTR_DB_OPERATION_NAME] = utils.parseNormalizedOperationName(queryConfig?.text);
        }

        const recordDuration = () => {
          plugin.recordOperationDuration(attributes, startTime);
        };

        const instrumentationConfig = plugin.getConfig();

        const span = utils.handleConfigQuery.call(
          this,
          plugin.tracer,
          instrumentationConfig,
          plugin._semconvStability,
          queryConfig,
        );

        // Modify query text w/ a tracing comment before invoking original for
        // tracing, but only if args[0] has one of our expected shapes.
        if (instrumentationConfig.addSqlCommenterCommentToQueries) {
          if (firstArgIsString) {
            args[0] = addSqlCommenterComment(span, arg0);
          } else if (firstArgIsQueryObjectWithText && !('name' in arg0)) {
            // In the case of a query object, we need to ensure there's no name field
            // as this indicates a prepared query, where the comment would remain the same
            // for every invocation and contain an outdated trace context.
            args[0] = {
              ...arg0,
              text: addSqlCommenterComment(span, arg0.text),
            };
          }
        }

        // Bind callback (if any) to parent span (if any)
        if (args.length > 0) {
          const parentSpan = trace.getSpan(context.active());
          if (typeof args[args.length - 1] === 'function') {
            // Patch ParameterQuery callback
            args[args.length - 1] = utils.patchCallback(
              instrumentationConfig,
              span,
              args[args.length - 1] as PostgresCallback, // nb: not type safe.
              attributes,
              recordDuration,
            );

            // If a parent span exists, bind the callback
            if (parentSpan) {
              args[args.length - 1] = context.bind(context.active(), args[args.length - 1]);
            }
          } else if (typeof queryConfig?.callback === 'function') {
            // Patch ConfigQuery callback
            let callback = utils.patchCallback(
              plugin.getConfig(),
              span,
              queryConfig.callback as PostgresCallback, // nb: not type safe.
              attributes,
              recordDuration,
            );

            // If a parent span existed, bind the callback
            if (parentSpan) {
              callback = context.bind(context.active(), callback);
            }

            (args[0] as { callback?: PostgresCallback }).callback = callback;
          }
        }

        const { requestHook } = instrumentationConfig;
        if (typeof requestHook === 'function' && queryConfig) {
          safeExecuteInTheMiddle(
            () => {
              // pick keys to expose explicitly, so we're not leaking pg package
              // internals that are subject to change
              const { database, host, port, user } = this.connectionParameters;
              const connection = { database, host, port, user };

              requestHook(span, {
                connection,
                query: {
                  text: queryConfig.text,
                  // nb: if `client.query` is called with illegal arguments
                  // (e.g., if `queryConfig.values` is passed explicitly, but a
                  // non-array is given), then the type casts will be wrong. But
                  // we leave it up to the queryHook to handle that, and we
                  // catch and swallow any errors it throws. The other options
                  // are all worse. E.g., we could leave `queryConfig.values`
                  // and `queryConfig.name` as `unknown`, but then the hook body
                  // would be forced to validate (or cast) them before using
                  // them, which seems incredibly cumbersome given that these
                  // casts will be correct 99.9% of the time -- and pg.query
                  // will immediately throw during development in the other .1%
                  // of cases. Alternatively, we could simply skip calling the
                  // hook when `values` or `name` don't have the expected type,
                  // but that would add unnecessary validation overhead to every
                  // hook invocation and possibly be even more confusing/unexpected.
                  values: queryConfig.values as unknown[],
                  name: queryConfig.name as string | undefined,
                },
              });
            },
            err => {
              if (err) {
                plugin._diag.error('Error running query hook', err);
              }
            },
            true,
          );
        }

        let result: unknown;
        try {
          result = original.apply(this, args as never);
        } catch (e: unknown) {
          if (e instanceof Error) {
            span.recordException(utils.sanitizedErrorMessage(e));
          }
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: utils.getErrorMessage(e),
          });
          span.end();
          throw e;
        }

        // Bind promise to parent span and end the span
        if (result instanceof Promise) {
          return result
            .then((result: unknown) => {
              // Return a pass-along promise which ends the span and then goes to user's orig resolvers
              return new Promise(resolve => {
                utils.handleExecutionResult(plugin.getConfig(), span, result);
                recordDuration();
                span.end();
                resolve(result);
              });
            })
            .catch((error: Error) => {
              return new Promise((_, reject) => {
                if (error instanceof Error) {
                  span.recordException(utils.sanitizedErrorMessage(error));
                }
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
                recordDuration();
                span.end();
                reject(error);
              });
            });
        }

        // else returns void
        return result; // void
      };
    };
  }

  private _setPoolConnectEventListeners(pgPool: PgPoolExtended) {
    if (pgPool[EVENT_LISTENERS_SET]) return;
    const poolName = utils.getPoolName(pgPool.options);

    pgPool.on('connect', () => {
      this._connectionsCounter = utils.updateCounter(
        poolName,
        pgPool,
        this._connectionsCount,
        this._connectionPendingRequests,
        this._connectionsCounter,
      );
    });

    pgPool.on('acquire', () => {
      this._connectionsCounter = utils.updateCounter(
        poolName,
        pgPool,
        this._connectionsCount,
        this._connectionPendingRequests,
        this._connectionsCounter,
      );
    });

    pgPool.on('remove', () => {
      this._connectionsCounter = utils.updateCounter(
        poolName,
        pgPool,
        this._connectionsCount,
        this._connectionPendingRequests,
        this._connectionsCounter,
      );
    });

    pgPool.on('release' as any, () => {
      this._connectionsCounter = utils.updateCounter(
        poolName,
        pgPool,
        this._connectionsCount,
        this._connectionPendingRequests,
        this._connectionsCounter,
      );
    });
    pgPool[EVENT_LISTENERS_SET] = true;
  }

  private _getPoolConnectPatch() {
    const plugin = this;
    return (originalConnect: (...args: any[]) => any) => {
      return function connect(this: PgPoolExtended, callback?: PgPoolCallback) {
        const config = plugin.getConfig();

        if (utils.shouldSkipInstrumentation(config)) {
          return originalConnect.call(this, callback as any);
        }

        // Still set up event listeners for metrics even when skipping spans
        plugin._setPoolConnectEventListeners(this);

        if (config.ignoreConnectSpans) {
          return originalConnect.call(this, callback as any);
        }

        // setup span
        const span = plugin.tracer.startSpan(SpanNames.POOL_CONNECT, {
          kind: SpanKind.CLIENT,
          attributes: utils.getSemanticAttributesFromPoolConnection(this.options, plugin._semconvStability),
        });

        if (callback) {
          const parentSpan = trace.getSpan(context.active());
          callback = utils.patchCallbackPGPool(span, callback) as PgPoolCallback;
          // If a parent span exists, bind the callback
          if (parentSpan) {
            callback = context.bind(context.active(), callback);
          }
        }

        const connectResult: unknown = context.with(trace.setSpan(context.active(), span), () => {
          return originalConnect.call(this, callback as any);
        });

        return handleConnectResult(span, connectResult);
      };
    };
  }
}

function handleConnectResult(span: Span, connectResult: unknown) {
  if (!(connectResult instanceof Promise)) {
    return connectResult;
  }

  const connectResultPromise = connectResult as Promise<unknown>;
  return context.bind(
    context.active(),
    connectResultPromise
      .then(result => {
        span.end();
        return result;
      })
      .catch((error: unknown) => {
        if (error instanceof Error) {
          span.recordException(utils.sanitizedErrorMessage(error));
        }
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: utils.getErrorMessage(error),
        });
        span.end();
        return Promise.reject(error);
      }),
  );
}
