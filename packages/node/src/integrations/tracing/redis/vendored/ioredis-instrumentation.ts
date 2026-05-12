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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-ioredis-v0.62.0/packages/instrumentation-ioredis
 * - Upstream version: @opentelemetry/instrumentation-ioredis@0.62.0
 * - Minor TypeScript adjustments for this repository's compiler settings
 */
/* eslint-disable -- vendored @opentelemetry/instrumentation-ioredis */

import { context, diag, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import {
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';

import { defaultDbStatementSerializer } from './redis-common';
import {
  ATTR_DB_CONNECTION_STRING,
  ATTR_DB_STATEMENT,
  ATTR_DB_SYSTEM,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
  DB_SYSTEM_NAME_VALUE_REDIS,
  DB_SYSTEM_VALUE_REDIS,
} from './semconv';
import type { IORedisInstrumentationConfig } from './types';

const PACKAGE_NAME = '@opentelemetry/instrumentation-ioredis';
const PACKAGE_VERSION = '0.62.0';

// ---- utils ----

function endSpan(span: Span, err: Error | null | undefined): void {
  if (err) {
    span.recordException(err);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message,
    });
  }
  span.end();
}

// ---- IORedisInstrumentation ----

const DEFAULT_CONFIG: IORedisInstrumentationConfig = {
  requireParentSpan: true,
};

export class IORedisInstrumentation extends InstrumentationBase<IORedisInstrumentationConfig> {
  _netSemconvStability!: SemconvStability;
  _dbSemconvStability!: SemconvStability;

  constructor(config: IORedisInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, { ...DEFAULT_CONFIG, ...config });
    this._setSemconvStabilityFromEnv();
  }

  _setSemconvStabilityFromEnv(): void {
    this._netSemconvStability = semconvStabilityFromStr('http', process.env['OTEL_SEMCONV_STABILITY_OPT_IN']);
    this._dbSemconvStability = semconvStabilityFromStr('database', process.env['OTEL_SEMCONV_STABILITY_OPT_IN']);
  }

  override setConfig(config: IORedisInstrumentationConfig = {}): void {
    super.setConfig({ ...DEFAULT_CONFIG, ...config });
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition(
        'ioredis',
        ['>=2.0.0 <6'],
        (module: any, moduleVersion?: string) => {
          const moduleExports =
            module[Symbol.toStringTag] === 'Module'
              ? module.default // ESM
              : module; // CommonJS
          if (isWrapped(moduleExports.prototype.sendCommand)) {
            this._unwrap(moduleExports.prototype, 'sendCommand');
          }
          this._wrap(moduleExports.prototype, 'sendCommand', this._patchSendCommand(moduleVersion));
          if (isWrapped(moduleExports.prototype.connect)) {
            this._unwrap(moduleExports.prototype, 'connect');
          }
          this._wrap(moduleExports.prototype, 'connect', this._patchConnection());
          return module;
        },
        (module: any) => {
          if (module === undefined) return;
          const moduleExports =
            module[Symbol.toStringTag] === 'Module'
              ? module.default // ESM
              : module; // CommonJS
          this._unwrap(moduleExports.prototype, 'sendCommand');
          this._unwrap(moduleExports.prototype, 'connect');
        },
      ),
    ];
  }

  private _patchSendCommand(moduleVersion?: string) {
    return (original: Function) => {
      return this._traceSendCommand(original, moduleVersion);
    };
  }

  private _patchConnection() {
    return (original: Function) => {
      return this._traceConnection(original);
    };
  }

  private _traceSendCommand(original: Function, moduleVersion?: string) {
    const instrumentation = this;
    return function (this: any, cmd: any) {
      if (arguments.length < 1 || typeof cmd !== 'object') {
        return original.apply(this, arguments);
      }
      const config = instrumentation.getConfig();
      const dbStatementSerializer = config.dbStatementSerializer || defaultDbStatementSerializer;
      const hasNoParentSpan = trace.getSpan(context.active()) === undefined;
      if (config.requireParentSpan === true && hasNoParentSpan) {
        return original.apply(this, arguments);
      }
      const attributes: Record<string, any> = {};
      const { host, port } = this.options;
      const dbQueryText = dbStatementSerializer(cmd.name, cmd.args);
      if (instrumentation._dbSemconvStability & SemconvStability.OLD) {
        attributes[ATTR_DB_SYSTEM] = DB_SYSTEM_VALUE_REDIS;
        attributes[ATTR_DB_STATEMENT] = dbQueryText;
        attributes[ATTR_DB_CONNECTION_STRING] = `redis://${host}:${port}`;
      }
      if (instrumentation._dbSemconvStability & SemconvStability.STABLE) {
        attributes[ATTR_DB_SYSTEM_NAME] = DB_SYSTEM_NAME_VALUE_REDIS;
        attributes[ATTR_DB_QUERY_TEXT] = dbQueryText;
      }
      if (instrumentation._netSemconvStability & SemconvStability.OLD) {
        attributes[ATTR_NET_PEER_NAME] = host;
        attributes[ATTR_NET_PEER_PORT] = port;
      }
      if (instrumentation._netSemconvStability & SemconvStability.STABLE) {
        attributes[ATTR_SERVER_ADDRESS] = host;
        attributes[ATTR_SERVER_PORT] = port;
      }
      attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = 'auto.db.otel.redis';
      const span = instrumentation.tracer.startSpan(cmd.name, {
        kind: SpanKind.CLIENT,
        attributes,
      });
      const { requestHook } = config;
      if (requestHook) {
        safeExecuteInTheMiddle(
          () =>
            requestHook(span, {
              moduleVersion,
              cmdName: cmd.name,
              cmdArgs: cmd.args,
            }),
          (e: Error | undefined) => {
            if (e) {
              diag.error('ioredis instrumentation: request hook failed', e);
            }
          },
          true,
        );
      }
      try {
        const result = original.apply(this, arguments);
        const origResolve = cmd.resolve;
        cmd.resolve = function (result: unknown) {
          safeExecuteInTheMiddle(
            () => config.responseHook?.(span, cmd.name, cmd.args, result),
            (e: Error | undefined) => {
              if (e) {
                diag.error('ioredis instrumentation: response hook failed', e);
              }
            },
            true,
          );
          endSpan(span, null);
          origResolve(result);
        };
        const origReject = cmd.reject;
        cmd.reject = function (err: Error) {
          endSpan(span, err);
          origReject(err);
        };
        return result;
      } catch (error) {
        endSpan(span, error as Error);
        throw error;
      }
    };
  }

  private _traceConnection(original: Function) {
    const instrumentation = this;
    return function (this: any) {
      const hasNoParentSpan = trace.getSpan(context.active()) === undefined;
      if (instrumentation.getConfig().requireParentSpan === true && hasNoParentSpan) {
        return original.apply(this, arguments);
      }
      const attributes: Record<string, any> = {};
      const { host, port } = this.options;
      if (instrumentation._dbSemconvStability & SemconvStability.OLD) {
        attributes[ATTR_DB_SYSTEM] = DB_SYSTEM_VALUE_REDIS;
        attributes[ATTR_DB_STATEMENT] = 'connect';
        attributes[ATTR_DB_CONNECTION_STRING] = `redis://${host}:${port}`;
      }
      if (instrumentation._dbSemconvStability & SemconvStability.STABLE) {
        attributes[ATTR_DB_SYSTEM_NAME] = DB_SYSTEM_NAME_VALUE_REDIS;
        attributes[ATTR_DB_QUERY_TEXT] = 'connect';
      }
      if (instrumentation._netSemconvStability & SemconvStability.OLD) {
        attributes[ATTR_NET_PEER_NAME] = host;
        attributes[ATTR_NET_PEER_PORT] = port;
      }
      if (instrumentation._netSemconvStability & SemconvStability.STABLE) {
        attributes[ATTR_SERVER_ADDRESS] = host;
        attributes[ATTR_SERVER_PORT] = port;
      }
      attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = 'auto.db.otel.redis';
      const span = instrumentation.tracer.startSpan('connect', {
        kind: SpanKind.CLIENT,
        attributes,
      });
      try {
        const result = original.apply(this, arguments);
        if (typeof result?.then === 'function') {
          return result.then(
            (value: unknown) => {
              endSpan(span, null);
              return value;
            },
            (error: Error) => {
              endSpan(span, error);
              return Promise.reject(error);
            },
          );
        }
        endSpan(span, null);
        return result;
      } catch (error) {
        endSpan(span, error as Error);
        throw error;
      }
    };
  }
}
