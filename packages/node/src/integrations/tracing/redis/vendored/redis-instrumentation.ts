/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-redis-v0.62.0/packages/instrumentation-redis
 * - Upstream version: @opentelemetry/instrumentation-redis@0.62.0
 * - Minor TypeScript adjustments for this repository's compiler settings
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 */

import { SpanKind } from '@opentelemetry/api';
import type { TracerProvider } from '@opentelemetry/api';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import type { Span, SpanAttributes } from '@sentry/core';
import {
  debug,
  getActiveSpan,
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  withActiveSpan,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../../../debug-build';
import { InstrumentationNodeModuleFile } from '../../InstrumentationNodeModuleFile';
import { DB_STATEMENT, DB_SYSTEM } from '@sentry/conventions/attributes';
import { defaultDbStatementSerializer } from './redis-common';
import { ATTR_DB_CONNECTION_STRING, ATTR_NET_PEER_NAME, ATTR_NET_PEER_PORT, DB_SYSTEM_VALUE_REDIS } from './semconv';
import type { RedisInstrumentationConfig, RedisResponseCustomAttributeFunction } from './types';

const PACKAGE_NAME = '@sentry/instrumentation-redis';
const ORIGIN = 'auto.db.otel.redis';

// node-redis >= 5.12.0 publishes via diagnostics_channel, which Sentry subscribes
// to separately, so this monkey-patching instrumentation only covers the older
// `redis` (v2-v3), `@redis/client`/`@node-redis/client` (v1, i.e. node-redis v4)
// and node-redis 5.0-5.11 releases.

// ---- Internal types ----

interface RedisPluginClientTypes {
  connection_options?: {
    port?: string | number;
    host?: string;
  };
  address?: string;
}

interface RedisCommand {
  command: string;
  args: string[];
  buffer_args: boolean;
  callback: (err: Error | null, reply: unknown) => void;
  call_on_write: boolean;
}

interface MultiErrorReply extends Error {
  replies: unknown[];
  errorIndexes: Array<number>;
}

interface OpenSpanInfo {
  span: Span;
  commandName: string;
  commandArgs: Array<string | Buffer>;
}

const OTEL_OPEN_SPANS = Symbol('opentelemetry.instrumentation.redis.open_spans');
const MULTI_COMMAND_OPTIONS = Symbol('opentelemetry.instrumentation.redis.multi_command_options');

// ---- shared utils ----

function endSpan(span: Span, err: Error | null | undefined): void {
  if (err) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: err.message });
  }
  span.end();
}

function runResponseHook(
  responseHook: RedisResponseCustomAttributeFunction | undefined,
  span: Span,
  commandName: string,
  commandArgs: Array<string | Buffer>,
  response: unknown,
): void {
  if (!responseHook) {
    return;
  }
  try {
    responseHook(span, commandName, commandArgs, response);
  } catch {
    // never let a user-provided response hook break instrumentation
  }
}

// ---- v4-v5 utils ----

function removeCredentialsFromDBConnectionStringAttribute(url: string | undefined): string | undefined {
  if (typeof url !== 'string' || !url) {
    return undefined;
  }
  try {
    const u = new URL(url);
    u.searchParams.delete('user_pwd');
    u.username = '';
    u.password = '';
    return u.href;
  } catch (err) {
    DEBUG_BUILD && debug.error('failed to sanitize redis connection url', err);
  }
  return undefined;
}

function getClientAttributes(options: any): SpanAttributes {
  return {
    // eslint-disable-next-line typescript/no-deprecated
    [DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
    [ATTR_NET_PEER_NAME]: options?.socket?.host,
    [ATTR_NET_PEER_PORT]: options?.socket?.port,
    [ATTR_DB_CONNECTION_STRING]: removeCredentialsFromDBConnectionStringAttribute(options?.url),
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
  };
}

// ---- RedisInstrumentationV2_V3 ----

class RedisInstrumentationV2_V3 extends InstrumentationBase<RedisInstrumentationConfig> {
  static COMPONENT = 'redis';

  constructor(config: RedisInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition(
        'redis',
        ['>=2.6.0 <4'],
        (moduleExports: any) => {
          if (isWrapped(moduleExports.RedisClient.prototype['internal_send_command'])) {
            this._unwrap(moduleExports.RedisClient.prototype, 'internal_send_command');
          }
          this._wrap(moduleExports.RedisClient.prototype, 'internal_send_command', this._getPatchInternalSendCommand());
          return moduleExports;
        },
        (moduleExports: any) => {
          if (moduleExports === undefined) return;
          this._unwrap(moduleExports.RedisClient.prototype, 'internal_send_command');
        },
      ),
    ];
  }

  private _getPatchInternalSendCommand() {
    const instrumentation = this;
    return function internal_send_command(original: Function) {
      return function internal_send_command_trace(this: RedisPluginClientTypes, cmd: RedisCommand) {
        if (arguments.length !== 1 || typeof cmd !== 'object') {
          return original.apply(this, arguments);
        }
        const attributes: SpanAttributes = {
          /* eslint-disable typescript/no-deprecated */
          [DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
          [DB_STATEMENT]: defaultDbStatementSerializer(cmd.command, cmd.args),
          /* eslint-enable typescript/no-deprecated */
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
        };
        if (this.connection_options) {
          attributes[ATTR_NET_PEER_NAME] = this.connection_options.host;
          attributes[ATTR_NET_PEER_PORT] = this.connection_options.port;
        }
        if (this.address) {
          attributes[ATTR_DB_CONNECTION_STRING] = `redis://${this.address}`;
        }
        const span = startInactiveSpan({
          name: `${RedisInstrumentationV2_V3.COMPONENT}-${cmd.command}`,
          kind: SpanKind.CLIENT,
          attributes,
        });
        const originalCallback = arguments[0].callback;
        if (originalCallback) {
          const parentSpan = getActiveSpan();
          arguments[0].callback = function callback(this: any, err: Error | null, reply: unknown) {
            runResponseHook(instrumentation.getConfig().responseHook, span, cmd.command, cmd.args, reply);
            endSpan(span, err);
            return withActiveSpan(parentSpan ?? null, () => originalCallback.apply(this, arguments));
          };
        }
        try {
          return original.apply(this, arguments);
        } catch (rethrow) {
          endSpan(span, rethrow as Error);
          throw rethrow;
        }
      };
    };
  }
}

// ---- RedisInstrumentationV4_V5 ----

class RedisInstrumentationV4_V5 extends InstrumentationBase<RedisInstrumentationConfig> {
  static COMPONENT = 'redis';

  constructor(config: RedisInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  init() {
    return [
      this._getInstrumentationNodeModuleDefinition('@redis/client'),
      this._getInstrumentationNodeModuleDefinition('@node-redis/client'),
    ];
  }

  private _getInstrumentationNodeModuleDefinition(basePackageName: string) {
    const commanderModuleFile = new InstrumentationNodeModuleFile(
      `${basePackageName}/dist/lib/commander.js`,
      ['^1.0.0'],
      (moduleExports: any, moduleVersion?: string) => {
        const transformCommandArguments = moduleExports.transformCommandArguments;
        if (!transformCommandArguments) {
          DEBUG_BUILD && debug.error('internal instrumentation error, missing transformCommandArguments function');
          return moduleExports;
        }
        const functionToPatch = moduleVersion?.startsWith('1.0.') ? 'extendWithCommands' : 'attachCommands';
        if (isWrapped(moduleExports?.[functionToPatch])) {
          this._unwrap(moduleExports, functionToPatch);
        }
        this._wrap(moduleExports, functionToPatch, this._getPatchExtendWithCommands(transformCommandArguments));
        return moduleExports;
      },
      (moduleExports: any) => {
        if (isWrapped(moduleExports?.extendWithCommands)) {
          this._unwrap(moduleExports, 'extendWithCommands');
        }
        if (isWrapped(moduleExports?.attachCommands)) {
          this._unwrap(moduleExports, 'attachCommands');
        }
      },
    );

    const multiCommanderModule = new InstrumentationNodeModuleFile(
      `${basePackageName}/dist/lib/client/multi-command.js`,
      ['^1.0.0', '>=5.0.0 <5.12.0'],
      (moduleExports: any) => {
        const redisClientMultiCommandPrototype = moduleExports?.default?.prototype;
        if (isWrapped(redisClientMultiCommandPrototype?.exec)) {
          this._unwrap(redisClientMultiCommandPrototype, 'exec');
        }
        this._wrap(redisClientMultiCommandPrototype, 'exec', this._getPatchMultiCommandsExec());
        if (isWrapped(redisClientMultiCommandPrototype?.execAsPipeline)) {
          this._unwrap(redisClientMultiCommandPrototype, 'execAsPipeline');
        }
        this._wrap(redisClientMultiCommandPrototype, 'execAsPipeline', this._getPatchMultiCommandsExec());
        if (isWrapped(redisClientMultiCommandPrototype?.addCommand)) {
          this._unwrap(redisClientMultiCommandPrototype, 'addCommand');
        }
        this._wrap(redisClientMultiCommandPrototype, 'addCommand', this._getPatchMultiCommandsAddCommand());
        return moduleExports;
      },
      (moduleExports: any) => {
        const redisClientMultiCommandPrototype = moduleExports?.default?.prototype;
        if (isWrapped(redisClientMultiCommandPrototype?.exec)) {
          this._unwrap(redisClientMultiCommandPrototype, 'exec');
        }
        if (isWrapped(redisClientMultiCommandPrototype?.execAsPipeline)) {
          this._unwrap(redisClientMultiCommandPrototype, 'execAsPipeline');
        }
        if (isWrapped(redisClientMultiCommandPrototype?.addCommand)) {
          this._unwrap(redisClientMultiCommandPrototype, 'addCommand');
        }
      },
    );

    const clientIndexModule = new InstrumentationNodeModuleFile(
      `${basePackageName}/dist/lib/client/index.js`,
      ['^1.0.0', '>=5.0.0 <5.12.0'],
      (moduleExports: any) => {
        const redisClientPrototype = moduleExports?.default?.prototype;
        if (redisClientPrototype?.multi) {
          if (isWrapped(redisClientPrototype?.multi)) {
            this._unwrap(redisClientPrototype, 'multi');
          }
          this._wrap(redisClientPrototype, 'multi', this._getPatchRedisClientMulti());
        }
        if (redisClientPrototype?.MULTI) {
          if (isWrapped(redisClientPrototype?.MULTI)) {
            this._unwrap(redisClientPrototype, 'MULTI');
          }
          this._wrap(redisClientPrototype, 'MULTI', this._getPatchRedisClientMulti());
        }
        if (isWrapped(redisClientPrototype?.sendCommand)) {
          this._unwrap(redisClientPrototype, 'sendCommand');
        }
        this._wrap(redisClientPrototype, 'sendCommand', this._getPatchRedisClientSendCommand());
        if (isWrapped(redisClientPrototype?.connect)) {
          this._unwrap(redisClientPrototype, 'connect');
        }
        this._wrap(redisClientPrototype, 'connect', this._getPatchedClientConnect());
        return moduleExports;
      },
      (moduleExports: any) => {
        const redisClientPrototype = moduleExports?.default?.prototype;
        if (isWrapped(redisClientPrototype?.multi)) {
          this._unwrap(redisClientPrototype, 'multi');
        }
        if (isWrapped(redisClientPrototype?.MULTI)) {
          this._unwrap(redisClientPrototype, 'MULTI');
        }
        if (isWrapped(redisClientPrototype?.sendCommand)) {
          this._unwrap(redisClientPrototype, 'sendCommand');
        }
        if (isWrapped(redisClientPrototype?.connect)) {
          this._unwrap(redisClientPrototype, 'connect');
        }
      },
    );

    return new InstrumentationNodeModuleDefinition(
      basePackageName,
      ['^1.0.0', '>=5.0.0 <5.12.0'],
      (moduleExports: any) => moduleExports,
      () => {},
      [commanderModuleFile, multiCommanderModule, clientIndexModule],
    );
  }

  private _getPatchExtendWithCommands(transformCommandArguments: Function) {
    const plugin = this;
    return function extendWithCommandsPatchWrapper(original: Function) {
      return function extendWithCommandsPatch(this: any, config: any) {
        if (config?.BaseClass?.name !== 'RedisClient') {
          return original.apply(this, arguments);
        }
        const origExecutor = config.executor;
        config.executor = function (this: any, command: any, args: any) {
          const redisCommandArguments = transformCommandArguments(command, args).args;
          return plugin._traceClientCommand(origExecutor, this, arguments, redisCommandArguments);
        };
        return original.apply(this, arguments);
      };
    };
  }

  private _getPatchMultiCommandsExec() {
    const plugin = this;
    return function execPatchWrapper(original: Function) {
      return function execPatch(this: any) {
        const execRes = original.apply(this, arguments);
        if (typeof execRes?.then !== 'function') {
          DEBUG_BUILD && debug.error('non-promise result when patching exec/execAsPipeline');
          return execRes;
        }
        return execRes
          .then((redisRes: unknown[]) => {
            const openSpans: OpenSpanInfo[] = this[OTEL_OPEN_SPANS];
            plugin._endSpansWithRedisReplies(openSpans, redisRes);
            return redisRes;
          })
          .catch((err: any) => {
            const openSpans: OpenSpanInfo[] = this[OTEL_OPEN_SPANS];
            if (!openSpans) {
              DEBUG_BUILD && debug.error('cannot find open spans to end for multi/pipeline');
            } else {
              const replies =
                err.constructor.name === 'MultiErrorReply'
                  ? (err as MultiErrorReply).replies
                  : new Array(openSpans.length).fill(err);
              plugin._endSpansWithRedisReplies(openSpans, replies);
            }
            return Promise.reject(err);
          });
      };
    };
  }

  private _getPatchMultiCommandsAddCommand() {
    const plugin = this;
    return function addCommandWrapper(original: Function) {
      return function addCommandPatch(this: any, args: any) {
        return plugin._traceClientCommand(original, this, arguments, args);
      };
    };
  }

  private _getPatchRedisClientMulti() {
    return function multiPatchWrapper(original: Function) {
      return function multiPatch(this: any) {
        const multiRes: any = original.apply(this, arguments);
        multiRes[MULTI_COMMAND_OPTIONS] = this.options;
        return multiRes;
      };
    };
  }

  private _getPatchRedisClientSendCommand() {
    const plugin = this;
    return function sendCommandWrapper(original: Function) {
      return function sendCommandPatch(this: any, args: any) {
        return plugin._traceClientCommand(original, this, arguments, args);
      };
    };
  }

  private _getPatchedClientConnect() {
    return function connectWrapper(original: Function) {
      return function patchedConnect(this: any) {
        const attributes = getClientAttributes(this.options);
        const span = startInactiveSpan({
          name: `${RedisInstrumentationV4_V5.COMPONENT}-connect`,
          kind: SpanKind.CLIENT,
          attributes,
        });
        const res = withActiveSpan(span, () => original.apply(this));
        return res.then(
          (result: any) => {
            span.end();
            return result;
          },
          (error: Error) => {
            endSpan(span, error);
            return Promise.reject(error);
          },
        );
      };
    };
  }

  _traceClientCommand(
    origFunction: Function,
    origThis: any,
    origArguments: IArguments,
    redisCommandArguments: Array<string | Buffer>,
  ): any {
    const clientOptions = origThis.options || origThis[MULTI_COMMAND_OPTIONS];
    const commandName = redisCommandArguments[0] as string;
    const commandArgs = redisCommandArguments.slice(1);
    const attributes = getClientAttributes(clientOptions);
    const dbStatement = defaultDbStatementSerializer(commandName, commandArgs);
    if (dbStatement != null) {
      // eslint-disable-next-line typescript/no-deprecated
      attributes[DB_STATEMENT] = dbStatement;
    }
    const span = startInactiveSpan({
      name: `${RedisInstrumentationV4_V5.COMPONENT}-${commandName}`,
      kind: SpanKind.CLIENT,
      attributes,
    });
    const res = withActiveSpan(span, () => origFunction.apply(origThis, origArguments));
    if (res instanceof Promise) {
      res.then(
        (redisRes: unknown) => {
          this._endSpanWithResponse(span, commandName, commandArgs, redisRes, undefined);
        },
        (err: Error) => {
          this._endSpanWithResponse(span, commandName, commandArgs, null, err);
        },
      );
    } else {
      const redisClientMultiCommand: any = res;
      redisClientMultiCommand[OTEL_OPEN_SPANS] = redisClientMultiCommand[OTEL_OPEN_SPANS] || [];
      redisClientMultiCommand[OTEL_OPEN_SPANS].push({
        span,
        commandName,
        commandArgs,
      });
    }
    return res;
  }

  _endSpansWithRedisReplies(openSpans: OpenSpanInfo[] | undefined, replies: unknown[]): void {
    if (!openSpans) {
      DEBUG_BUILD && debug.error('cannot find open spans to end for redis multi/pipeline');
      return;
    }
    if (replies.length !== openSpans.length) {
      DEBUG_BUILD && debug.error('number of multi command spans does not match response from redis');
      return;
    }
    for (let i = 0; i < openSpans.length; i++) {
      const { span, commandName, commandArgs } = openSpans[i]!;
      const currCommandRes = replies[i];
      const [res, err] = currCommandRes instanceof Error ? [null, currCommandRes] : [currCommandRes, undefined];
      this._endSpanWithResponse(span, commandName, commandArgs, res, err);
    }
  }

  _endSpanWithResponse(
    span: Span,
    commandName: string,
    commandArgs: Array<string | Buffer>,
    response: unknown,
    error: Error | null | undefined,
  ): void {
    if (!error) {
      runResponseHook(this.getConfig().responseHook, span, commandName, commandArgs, response);
    }
    endSpan(span, error);
  }
}

// ---- RedisInstrumentation (wrapper) ----

export class RedisInstrumentation extends InstrumentationBase<RedisInstrumentationConfig> {
  private instrumentationV2_V3: RedisInstrumentationV2_V3;
  private instrumentationV4_V5: RedisInstrumentationV4_V5;
  private initialized = false;

  constructor(config: RedisInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
    this.instrumentationV2_V3 = new RedisInstrumentationV2_V3(this.getConfig());
    this.instrumentationV4_V5 = new RedisInstrumentationV4_V5(this.getConfig());
    this.initialized = true;
  }

  override setConfig(config: RedisInstrumentationConfig = {}): void {
    super.setConfig(config);
    if (!this.initialized) {
      return;
    }
    this.instrumentationV2_V3.setConfig(config);
    this.instrumentationV4_V5.setConfig(config);
  }

  init() {}

  override getModuleDefinitions() {
    return [...this.instrumentationV2_V3.getModuleDefinitions(), ...this.instrumentationV4_V5.getModuleDefinitions()];
  }

  override setTracerProvider(tracerProvider: TracerProvider): void {
    super.setTracerProvider(tracerProvider);
    if (!this.initialized) {
      return;
    }
    this.instrumentationV2_V3.setTracerProvider(tracerProvider);
    this.instrumentationV4_V5.setTracerProvider(tracerProvider);
  }

  override enable(): void {
    super.enable();
    if (!this.initialized) {
      return;
    }
    this.instrumentationV2_V3.enable();
    this.instrumentationV4_V5.enable();
  }

  override disable(): void {
    super.disable();
    if (!this.initialized) {
      return;
    }
    this.instrumentationV2_V3.disable();
    this.instrumentationV4_V5.disable();
  }
}
