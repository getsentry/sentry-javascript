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
 * - Upstream version: @opentelemetry/instrumentation-redis@0.62.0 and @opentelemetry/instrumentation-ioredis@0.62.0
 * - Minor TypeScript adjustments for this repository's compiler settings
 */
/* eslint-disable -- vendored @opentelemetry/instrumentation-redis */

import type { Span } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

// ---- redis types ----

/**
 * Function that can be used to add custom attributes to span on response from redis server
 */
export interface RedisResponseCustomAttributeFunction {
  (span: Span, cmdName: string, cmdArgs: Array<string | Buffer>, response: unknown): void;
}

export interface RedisInstrumentationConfig extends InstrumentationConfig {
  /** Function for adding custom attributes on db response */
  responseHook?: RedisResponseCustomAttributeFunction;
}

// ---- ioredis types ----

export type CommandArgs = Array<string | Buffer | number | any[]>;

/**
 * Function that can be used to add custom attributes to span on response from redis server (ioredis)
 */
export interface IORedisResponseCustomAttributeFunction {
  (span: Span, cmdName: string, cmdArgs: CommandArgs, response: unknown): void;
}

export interface IORedisInstrumentationConfig extends InstrumentationConfig {
  /** Function for adding custom attributes on db response */
  responseHook?: IORedisResponseCustomAttributeFunction;
}
