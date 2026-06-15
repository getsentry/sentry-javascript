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
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 */

import { SpanKind } from '@opentelemetry/api';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import type { Span, SpanAttributes } from '@sentry/core';
import {
  getActiveSpan,
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
} from '@sentry/core';
import { defaultDbStatementSerializer } from './redis-common';
import {
  ATTR_DB_CONNECTION_STRING,
  ATTR_DB_STATEMENT,
  ATTR_DB_SYSTEM,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
  DB_SYSTEM_VALUE_REDIS,
} from './semconv';
import type { IORedisInstrumentationConfig } from './types';

const PACKAGE_NAME = '@sentry/instrumentation-ioredis';
const ORIGIN = 'auto.db.otel.redis';

// ioredis >= 5.11.0 publishes via diagnostics_channel, which Sentry subscribes
// to separately, so this monkey-patching instrumentation only covers < 5.11.0.
const SUPPORTED_VERSIONS = ['>=2.0.0 <5.11.0'];

// The raw imported `ioredis` module is either the CommonJS export or an ESM
// namespace wrapping it on `.default`. Typed shallowly since it is only used
// internally to reach the `Redis` prototype that holds the methods we patch.
type IORedisModule = {
  default?: { prototype: RedisPrototype };
  prototype: RedisPrototype;
  [Symbol.toStringTag]?: string;
};

interface RedisPrototype {
  sendCommand: (...args: unknown[]) => unknown;
  connect: (...args: unknown[]) => unknown;
}

// The `this` of the patched methods is a Redis client instance exposing its
// connection options.
interface RedisClient {
  options: { host?: string; port?: number };
}

// The in-flight command object ioredis passes to `sendCommand`. We swap its
// `resolve`/`reject` so the span ends when the command settles.
interface RedisCommand {
  name: string;
  args: Array<string | Buffer>;
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
}

function endSpan(span: Span, err: Error | null | undefined): void {
  if (err) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: err.message });
  }
  span.end();
}

export class IORedisInstrumentation extends InstrumentationBase<IORedisInstrumentationConfig> {
  public constructor(config: IORedisInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  protected init(): InstrumentationNodeModuleDefinition[] {
    return [
      new InstrumentationNodeModuleDefinition(
        'ioredis',
        SUPPORTED_VERSIONS,
        (module: IORedisModule) => {
          const moduleExports = module[Symbol.toStringTag] === 'Module' && module.default ? module.default : module;
          if (isWrapped(moduleExports.prototype.sendCommand)) {
            this._unwrap(moduleExports.prototype, 'sendCommand');
          }
          this._wrap(moduleExports.prototype, 'sendCommand', this._patchSendCommand());
          if (isWrapped(moduleExports.prototype.connect)) {
            this._unwrap(moduleExports.prototype, 'connect');
          }
          this._wrap(moduleExports.prototype, 'connect', this._patchConnection());
          return module;
        },
        (module: IORedisModule | undefined) => {
          if (module === undefined) return;
          const moduleExports = module[Symbol.toStringTag] === 'Module' && module.default ? module.default : module;
          this._unwrap(moduleExports.prototype, 'sendCommand');
          this._unwrap(moduleExports.prototype, 'connect');
        },
      ),
    ];
  }

  private _patchSendCommand() {
    const instrumentation = this;
    return (original: (...args: unknown[]) => unknown) => {
      return function (this: RedisClient, ...args: unknown[]): unknown {
        const cmd = args[0] as RedisCommand | undefined;
        // ioredis only creates a span when there is an active parent span
        // (the upstream `requireParentSpan` default, which Sentry never overrides).
        if (args.length < 1 || typeof cmd !== 'object' || !getActiveSpan()) {
          return original.apply(this, args);
        }

        const { host, port } = this.options;
        const attributes: SpanAttributes = {
          [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
          [ATTR_DB_STATEMENT]: defaultDbStatementSerializer(cmd.name, cmd.args),
          [ATTR_DB_CONNECTION_STRING]: `redis://${host}:${port}`,
          [ATTR_NET_PEER_NAME]: host,
          [ATTR_NET_PEER_PORT]: port,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
        };

        const span = startInactiveSpan({ name: cmd.name, kind: SpanKind.CLIENT, attributes });

        try {
          const result = original.apply(this, args);
          const origResolve = cmd.resolve;
          cmd.resolve = function (response: unknown): void {
            instrumentation._callResponseHook(span, cmd, response);
            endSpan(span, null);
            origResolve(response);
          };
          const origReject = cmd.reject;
          cmd.reject = function (err: Error): void {
            endSpan(span, err);
            origReject(err);
          };
          return result;
        } catch (error) {
          endSpan(span, error as Error);
          throw error;
        }
      };
    };
  }

  private _patchConnection() {
    return (original: (...args: unknown[]) => unknown) => {
      return function (this: RedisClient, ...args: unknown[]): unknown {
        if (!getActiveSpan()) {
          return original.apply(this, args);
        }

        const { host, port } = this.options;
        const attributes: SpanAttributes = {
          [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
          [ATTR_DB_STATEMENT]: 'connect',
          [ATTR_DB_CONNECTION_STRING]: `redis://${host}:${port}`,
          [ATTR_NET_PEER_NAME]: host,
          [ATTR_NET_PEER_PORT]: port,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
        };

        const span = startInactiveSpan({ name: 'connect', kind: SpanKind.CLIENT, attributes });

        try {
          const result = original.apply(this, args) as Promise<unknown> | undefined;
          if (result instanceof Promise) {
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
    };
  }

  private _callResponseHook(span: Span, cmd: RedisCommand, response: unknown): void {
    const { responseHook } = this.getConfig();
    if (!responseHook) {
      return;
    }
    try {
      responseHook(span, cmd.name, cmd.args, response);
    } catch {
      // ignore errors thrown from the user-provided response hook
    }
  }
}
