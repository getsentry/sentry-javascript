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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-redis-v0.62.0/packages/instrumentation-redis
 * - Upstream version: @opentelemetry/instrumentation-redis@0.62.0
 * - Minor TypeScript adjustments for this repository's compiler settings
 */
/* eslint-disable -- vendored @opentelemetry/instrumentation-redis */

import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { DiagLogger, Span, TracerProvider } from '@opentelemetry/api';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import {
  ATTR_DB_OPERATION_NAME,
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
import type { RedisInstrumentationConfig } from './types';

const PACKAGE_NAME = '@opentelemetry/instrumentation-redis';
const PACKAGE_VERSION = '0.62.0';

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

// ---- v4-v5 utils ----

function removeCredentialsFromDBConnectionStringAttribute(
  diagLogger: DiagLogger,
  url: string | undefined,
): string | undefined {
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
    diagLogger.error('failed to sanitize redis connection url', err);
  }
  return undefined;
}

function getClientAttributes(
  diagLogger: DiagLogger,
  options: any,
  semconvStability: SemconvStability,
): Record<string, any> {
  const attributes: Record<string, any> = {};
  if (semconvStability & SemconvStability.OLD) {
    Object.assign(attributes, {
      [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
      [ATTR_NET_PEER_NAME]: options?.socket?.host,
      [ATTR_NET_PEER_PORT]: options?.socket?.port,
      [ATTR_DB_CONNECTION_STRING]: removeCredentialsFromDBConnectionStringAttribute(diagLogger, options?.url),
    });
  }
  if (semconvStability & SemconvStability.STABLE) {
    Object.assign(attributes, {
      [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_REDIS,
      [ATTR_SERVER_ADDRESS]: options?.socket?.host,
      [ATTR_SERVER_PORT]: options?.socket?.port,
    });
  }
  return attributes;
}

// ---- v2-v3 utils ----

function endSpanV2(span: Span, err: Error | null | undefined): void {
  if (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message,
    });
  }
  span.end();
}

function getTracedCreateClient(original: Function): Function {
  return function createClientTrace(this: any) {
    const client = original.apply(this, arguments);
    return context.bind(context.active(), client);
  };
}

function getTracedCreateStreamTrace(original: Function): Function {
  return function create_stream_trace(this: any) {
    if (!Object.prototype.hasOwnProperty.call(this, 'stream')) {
      Object.defineProperty(this, 'stream', {
        get() {
          return this._patched_redis_stream;
        },
        set(val: any) {
          context.bind(context.active(), val);
          this._patched_redis_stream = val;
        },
      });
    }
    return original.apply(this, arguments);
  };
}

// ---- RedisInstrumentationV2_V3 ----

class RedisInstrumentationV2_V3 extends InstrumentationBase<RedisInstrumentationConfig> {
  static COMPONENT = 'redis';
  _semconvStability: SemconvStability;

  constructor(config: RedisInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this._semconvStability = config.semconvStability
      ? config.semconvStability
      : semconvStabilityFromStr('database', process.env['OTEL_SEMCONV_STABILITY_OPT_IN']);
  }

  override setConfig(config: RedisInstrumentationConfig = {}): void {
    super.setConfig(config);
    this._semconvStability = config.semconvStability
      ? config.semconvStability
      : semconvStabilityFromStr('database', process.env['OTEL_SEMCONV_STABILITY_OPT_IN']);
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
          if (isWrapped(moduleExports.RedisClient.prototype['create_stream'])) {
            this._unwrap(moduleExports.RedisClient.prototype, 'create_stream');
          }
          this._wrap(moduleExports.RedisClient.prototype, 'create_stream', this._getPatchCreateStream());
          if (isWrapped(moduleExports.createClient)) {
            this._unwrap(moduleExports, 'createClient');
          }
          this._wrap(moduleExports, 'createClient', this._getPatchCreateClient());
          return moduleExports;
        },
        (moduleExports: any) => {
          if (moduleExports === undefined) return;
          this._unwrap(moduleExports.RedisClient.prototype, 'internal_send_command');
          this._unwrap(moduleExports.RedisClient.prototype, 'create_stream');
          this._unwrap(moduleExports, 'createClient');
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
        const config = instrumentation.getConfig();
        const hasNoParentSpan = trace.getSpan(context.active()) === undefined;
        if (config.requireParentSpan === true && hasNoParentSpan) {
          return original.apply(this, arguments);
        }
        const dbStatementSerializer = config?.dbStatementSerializer || defaultDbStatementSerializer;
        const attributes: Record<string, any> = {};
        if (instrumentation._semconvStability & SemconvStability.OLD) {
          Object.assign(attributes, {
            [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
            [ATTR_DB_STATEMENT]: dbStatementSerializer(cmd.command, cmd.args),
          });
        }
        if (instrumentation._semconvStability & SemconvStability.STABLE) {
          Object.assign(attributes, {
            [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_REDIS,
            [ATTR_DB_OPERATION_NAME]: cmd.command,
            [ATTR_DB_QUERY_TEXT]: dbStatementSerializer(cmd.command, cmd.args),
          });
        }
        attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = 'auto.db.otel.redis';
        const span = instrumentation.tracer.startSpan(`${RedisInstrumentationV2_V3.COMPONENT}-${cmd.command}`, {
          kind: SpanKind.CLIENT,
          attributes,
        });
        if (this.connection_options) {
          const connectionAttributes: Record<string, any> = {};
          if (instrumentation._semconvStability & SemconvStability.OLD) {
            Object.assign(connectionAttributes, {
              [ATTR_NET_PEER_NAME]: this.connection_options.host,
              [ATTR_NET_PEER_PORT]: this.connection_options.port,
            });
          }
          if (instrumentation._semconvStability & SemconvStability.STABLE) {
            Object.assign(connectionAttributes, {
              [ATTR_SERVER_ADDRESS]: this.connection_options.host,
              [ATTR_SERVER_PORT]: this.connection_options.port,
            });
          }
          span.setAttributes(connectionAttributes);
        }
        if (this.address && instrumentation._semconvStability & SemconvStability.OLD) {
          span.setAttribute(ATTR_DB_CONNECTION_STRING, `redis://${this.address}`);
        }
        const originalCallback = arguments[0].callback;
        if (originalCallback) {
          const originalContext = context.active();
          arguments[0].callback = function callback(this: any, err: Error | null, reply: unknown) {
            if (config?.responseHook) {
              const responseHook = config.responseHook;
              safeExecuteInTheMiddle(
                () => {
                  responseHook(span, cmd.command, cmd.args, reply);
                },
                (e: Error | undefined) => {
                  if (e) {
                    instrumentation._diag.error('Error executing responseHook', e);
                  }
                },
                true,
              );
            }
            endSpanV2(span, err);
            return context.with(originalContext, originalCallback, this, ...arguments);
          };
        }
        try {
          return original.apply(this, arguments);
        } catch (rethrow) {
          endSpanV2(span, rethrow as Error);
          throw rethrow;
        }
      };
    };
  }

  private _getPatchCreateClient() {
    return function createClient(original: Function) {
      return getTracedCreateClient(original);
    };
  }

  private _getPatchCreateStream() {
    return function createReadStream(original: Function) {
      return getTracedCreateStreamTrace(original);
    };
  }
}

// ---- RedisInstrumentationV4_V5 ----

class RedisInstrumentationV4_V5 extends InstrumentationBase<RedisInstrumentationConfig> {
  static COMPONENT = 'redis';
  _semconvStability: SemconvStability;

  constructor(config: RedisInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this._semconvStability = config.semconvStability
      ? config.semconvStability
      : semconvStabilityFromStr('database', process.env['OTEL_SEMCONV_STABILITY_OPT_IN']);
  }

  override setConfig(config: RedisInstrumentationConfig = {}): void {
    super.setConfig(config);
    this._semconvStability = config.semconvStability
      ? config.semconvStability
      : semconvStabilityFromStr('database', process.env['OTEL_SEMCONV_STABILITY_OPT_IN']);
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
          this._diag.error('internal instrumentation error, missing transformCommandArguments function');
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
        this._wrap(redisClientMultiCommandPrototype, 'exec', this._getPatchMultiCommandsExec(false));
        if (isWrapped(redisClientMultiCommandPrototype?.execAsPipeline)) {
          this._unwrap(redisClientMultiCommandPrototype, 'execAsPipeline');
        }
        this._wrap(redisClientMultiCommandPrototype, 'execAsPipeline', this._getPatchMultiCommandsExec(true));
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

  private _getPatchMultiCommandsExec(isPipeline: boolean) {
    const plugin = this;
    return function execPatchWrapper(original: Function) {
      return function execPatch(this: any) {
        const execRes = original.apply(this, arguments);
        if (typeof execRes?.then !== 'function') {
          plugin._diag.error('non-promise result when patching exec/execAsPipeline');
          return execRes;
        }
        return execRes
          .then((redisRes: unknown[]) => {
            const openSpans: OpenSpanInfo[] = this[OTEL_OPEN_SPANS];
            plugin._endSpansWithRedisReplies(openSpans, redisRes, isPipeline);
            return redisRes;
          })
          .catch((err: any) => {
            const openSpans: OpenSpanInfo[] = this[OTEL_OPEN_SPANS];
            if (!openSpans) {
              plugin._diag.error('cannot find open spans to end for multi/pipeline');
            } else {
              const replies =
                err.constructor.name === 'MultiErrorReply'
                  ? (err as MultiErrorReply).replies
                  : new Array(openSpans.length).fill(err);
              plugin._endSpansWithRedisReplies(openSpans, replies, isPipeline);
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
    const plugin = this;
    return function connectWrapper(original: Function) {
      return function patchedConnect(this: any) {
        const options = this.options;
        const attributes = getClientAttributes(plugin._diag, options, plugin._semconvStability);
        attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = 'auto.db.otel.redis';
        const span = plugin.tracer.startSpan(`${RedisInstrumentationV4_V5.COMPONENT}-connect`, {
          kind: SpanKind.CLIENT,
          attributes,
        });
        const res = context.with(trace.setSpan(context.active(), span), () => {
          return original.apply(this);
        });
        return res
          .then((result: any) => {
            span.end();
            return result;
          })
          .catch((error: Error) => {
            span.recordException(error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
            span.end();
            return Promise.reject(error);
          });
      };
    };
  }

  _traceClientCommand(
    origFunction: Function,
    origThis: any,
    origArguments: IArguments,
    redisCommandArguments: Array<string | Buffer>,
  ): any {
    const hasNoParentSpan = trace.getSpan(context.active()) === undefined;
    if (hasNoParentSpan && this.getConfig().requireParentSpan) {
      return origFunction.apply(origThis, origArguments);
    }
    const clientOptions = origThis.options || origThis[MULTI_COMMAND_OPTIONS];
    const commandName = redisCommandArguments[0] as string;
    const commandArgs = redisCommandArguments.slice(1);
    const dbStatementSerializer = this.getConfig().dbStatementSerializer || defaultDbStatementSerializer;
    const attributes = getClientAttributes(this._diag, clientOptions, this._semconvStability);
    if (this._semconvStability & SemconvStability.STABLE) {
      attributes[ATTR_DB_OPERATION_NAME] = commandName;
    }
    try {
      const dbStatement = dbStatementSerializer(commandName, commandArgs);
      if (dbStatement != null) {
        if (this._semconvStability & SemconvStability.OLD) {
          attributes[ATTR_DB_STATEMENT] = dbStatement;
        }
        if (this._semconvStability & SemconvStability.STABLE) {
          attributes[ATTR_DB_QUERY_TEXT] = dbStatement;
        }
      }
    } catch (e) {
      this._diag.error('dbStatementSerializer throw an exception', e, { commandName });
    }
    attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = 'auto.db.otel.redis';
    const span = this.tracer.startSpan(`${RedisInstrumentationV4_V5.COMPONENT}-${commandName}`, {
      kind: SpanKind.CLIENT,
      attributes,
    });
    const res = context.with(trace.setSpan(context.active(), span), () => {
      return origFunction.apply(origThis, origArguments);
    });
    if (typeof res?.then === 'function') {
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

  _endSpansWithRedisReplies(openSpans: OpenSpanInfo[] | undefined, replies: unknown[], isPipeline = false): void {
    if (!openSpans) {
      return this._diag.error('cannot find open spans to end for redis multi/pipeline');
    }
    if (replies.length !== openSpans.length) {
      return this._diag.error('number of multi command spans does not match response from redis');
    }
    const allCommands = openSpans.map(s => s.commandName);
    const allSameCommand = allCommands.every(cmd => cmd === allCommands[0]);
    const operationName = allSameCommand
      ? (isPipeline ? 'PIPELINE ' : 'MULTI ') + allCommands[0]
      : isPipeline
        ? 'PIPELINE'
        : 'MULTI';
    for (let i = 0; i < openSpans.length; i++) {
      const { span, commandArgs } = openSpans[i]!;
      const currCommandRes = replies[i];
      const [res, err] = currCommandRes instanceof Error ? [null, currCommandRes] : [currCommandRes, undefined];
      if (this._semconvStability & SemconvStability.STABLE) {
        span.setAttribute(ATTR_DB_OPERATION_NAME, operationName);
      }
      this._endSpanWithResponse(span, allCommands[i]!, commandArgs, res, err);
    }
  }

  _endSpanWithResponse(
    span: Span,
    commandName: string,
    commandArgs: Array<string | Buffer>,
    response: unknown,
    error: Error | null | undefined,
  ): void {
    const { responseHook } = this.getConfig();
    if (!error && responseHook) {
      try {
        responseHook(span, commandName, commandArgs, response);
      } catch (err) {
        this._diag.error('responseHook throw an exception', err);
      }
    }
    if (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
    }
    span.end();
  }
}

// ---- RedisInstrumentation (wrapper) ----

const DEFAULT_CONFIG: RedisInstrumentationConfig = {
  requireParentSpan: false,
};

export class RedisInstrumentation extends InstrumentationBase<RedisInstrumentationConfig> {
  private instrumentationV2_V3: RedisInstrumentationV2_V3;
  private instrumentationV4_V5: RedisInstrumentationV4_V5;
  private initialized = false;

  constructor(config: RedisInstrumentationConfig = {}) {
    const resolvedConfig = { ...DEFAULT_CONFIG, ...config };
    super(PACKAGE_NAME, PACKAGE_VERSION, resolvedConfig);
    this.instrumentationV2_V3 = new RedisInstrumentationV2_V3(this.getConfig());
    this.instrumentationV4_V5 = new RedisInstrumentationV4_V5(this.getConfig());
    this.initialized = true;
  }

  override setConfig(config: RedisInstrumentationConfig = {}): void {
    const newConfig = { ...DEFAULT_CONFIG, ...config };
    super.setConfig(newConfig);
    if (!this.initialized) {
      return;
    }
    this.instrumentationV2_V3.setConfig(newConfig);
    this.instrumentationV4_V5.setConfig(newConfig);
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
