/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-pg
 * - Upstream version: @opentelemetry/instrumentation-pg@0.70.0
 * - Types from `pg` and `pg-pool` packages inlined as simplified interfaces
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 * - Dropped the OTel metrics (no MeterProvider is wired up), the `SemconvStability`
 *   dual-emission, and config the SDK never passes (request/response hooks,
 *   enhancedDatabaseReporting, addSqlCommenterCommentToQueries)
 */

import { SpanKind } from '@opentelemetry/api';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import type { Span } from '@sentry/core';
import { getActiveSpan, SDK_VERSION, SPAN_STATUS_ERROR, startInactiveSpan, withActiveSpan } from '@sentry/core';
import { InstrumentationNodeModuleFile } from '../../InstrumentationNodeModuleFile';
import { SpanNames } from './enums/SpanNames';
import type {
  PgClientConnect,
  PgClientExtended,
  PgPoolCallback,
  PgPoolExtended,
  PostgresCallback,
} from './internal-types';
import type { PgInstrumentationConfig } from './types';
import * as utils from './utils';

const PACKAGE_NAME = '@sentry/instrumentation-pg';

function extractModuleExports(module: any): any {
  return module[Symbol.toStringTag] === 'Module'
    ? module.default // ESM
    : module; // CommonJS
}

/**
 * Binds `callback` to `parentSpan`, so that the span is active again whenever the
 * (deferred) callback runs. This mirrors the upstream `context.bind(context.active(), callback)`:
 * `pg` invokes callbacks outside of the original async scope (e.g. for pooled connections), so we
 * re-establish the trace context to keep spans created inside the callback correctly parented.
 */
function bindCallbackToSpan<T extends (...args: any[]) => any>(parentSpan: Span, callback: T): T {
  return function (this: unknown, ...args: any[]): unknown {
    return withActiveSpan(parentSpan, () => callback.apply(this, args));
  } as T;
}

export class PgInstrumentation extends InstrumentationBase<PgInstrumentationConfig> {
  public constructor(config: PgInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  protected init(): InstrumentationNodeModuleDefinition[] {
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
        this._wrap(moduleExports.prototype, 'connect', this._getPoolConnectPatch());
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

  private _patchPgClient(module: any): any {
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

    this._wrap(moduleExports.prototype, 'query', this._getClientQueryPatch());

    this._wrap(moduleExports.prototype, 'connect', this._getClientConnectPatch());

    return module;
  }

  private _unpatchPgClient(module: any): any {
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
      return function connect(this: PgClientExtended, callback?: (...args: unknown[]) => void) {
        if (utils.shouldSkipInstrumentation() || plugin.getConfig().ignoreConnectSpans) {
          return original.call(this, callback);
        }

        const span = startInactiveSpan({
          name: SpanNames.CONNECT,
          kind: SpanKind.CLIENT,
          attributes: utils.getSemanticAttributesFromConnection(this),
        });

        let cb = callback;
        if (cb) {
          const parentSpan = getActiveSpan();
          cb = utils.patchClientConnectCallback(span, cb);
          if (parentSpan) {
            cb = bindCallbackToSpan(parentSpan, cb);
          }
        }

        const connectResult: unknown = withActiveSpan(span, () => {
          return original.call(this, cb);
        });

        return handleConnectResult(span, connectResult);
      };
    };
  }

  private _getClientQueryPatch() {
    return (original: (...args: any[]) => any) => {
      this._diag.debug('Patching pg.Client.prototype.query');
      return function query(this: PgClientExtended, ...args: unknown[]) {
        if (utils.shouldSkipInstrumentation()) {
          return original.apply(this, args as never);
        }

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

        const queryConfig = firstArgIsString
          ? {
              text: arg0,
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

        const span = utils.handleConfigQuery.call(this, queryConfig);

        // Bind callback (if any) to parent span (if any)
        if (args.length > 0) {
          const parentSpan = getActiveSpan();
          if (typeof args[args.length - 1] === 'function') {
            // Patch ParameterQuery callback
            args[args.length - 1] = utils.patchCallback(span, args[args.length - 1] as PostgresCallback);

            // If a parent span exists, bind the callback
            if (parentSpan) {
              args[args.length - 1] = bindCallbackToSpan(parentSpan, args[args.length - 1] as PostgresCallback);
            }
          } else if (typeof queryConfig?.callback === 'function') {
            // Patch ConfigQuery callback
            let callback = utils.patchCallback(span, queryConfig.callback as PostgresCallback);

            // If a parent span existed, bind the callback
            if (parentSpan) {
              callback = bindCallbackToSpan(parentSpan, callback);
            }

            (args[0] as { callback?: PostgresCallback }).callback = callback;
          }
        }

        let result: unknown;
        try {
          result = original.apply(this, args as never);
        } catch (e: unknown) {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: utils.getErrorMessage(e) });
          span.end();
          throw e;
        }

        // Bind promise to parent span and end the span
        if (result instanceof Promise) {
          return result
            .then((result: unknown) => {
              span.end();
              return result;
            })
            .catch((error: unknown) => {
              span.setStatus({ code: SPAN_STATUS_ERROR, message: utils.getErrorMessage(error) });
              span.end();
              return Promise.reject(error);
            });
        }

        // else returns void
        return result; // void
      };
    };
  }

  private _getPoolConnectPatch() {
    const plugin = this;
    return (originalConnect: (...args: any[]) => any) => {
      return function connect(this: PgPoolExtended, callback?: PgPoolCallback) {
        if (utils.shouldSkipInstrumentation() || plugin.getConfig().ignoreConnectSpans) {
          return originalConnect.call(this, callback);
        }

        const span = startInactiveSpan({
          name: SpanNames.POOL_CONNECT,
          kind: SpanKind.CLIENT,
          attributes: utils.getSemanticAttributesFromPoolConnection(this.options),
        });

        let cb = callback;
        if (cb) {
          const parentSpan = getActiveSpan();
          cb = utils.patchCallbackPGPool(span, cb);
          // If a parent span exists, bind the callback
          if (parentSpan) {
            cb = bindCallbackToSpan(parentSpan, cb);
          }
        }

        const connectResult: unknown = withActiveSpan(span, () => {
          return originalConnect.call(this, cb);
        });

        return handleConnectResult(span, connectResult);
      };
    };
  }
}

function handleConnectResult(span: Span, connectResult: unknown): unknown {
  if (!(connectResult instanceof Promise)) {
    return connectResult;
  }

  const connectResultPromise = connectResult as Promise<unknown>;
  // The caller's continuation after `await client.connect()` keeps its trace context via the
  // SDK's async context propagation, so we don't need to re-bind the returned promise.
  return connectResultPromise
    .then(result => {
      span.end();
      return result;
    })
    .catch((error: unknown) => {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: utils.getErrorMessage(error) });
      span.end();
      return Promise.reject(error);
    });
}
