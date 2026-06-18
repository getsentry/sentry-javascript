/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-redis-v0.62.0/packages/instrumentation-redis
 * - Upstream version: @opentelemetry/instrumentation-redis@0.62.0 and @opentelemetry/instrumentation-ioredis@0.62.0
 * - Minor TypeScript adjustments for this repository's compiler settings
 */
/* eslint-disable -- vendored @opentelemetry/instrumentation-redis */

import type { Span } from '@sentry/core';
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
