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

import type { Span } from '@opentelemetry/api';
import type { InstrumentationConfig, SemconvStability } from '@opentelemetry/instrumentation';

// ---- redis types ----

/**
 * Function that can be used to serialize db.statement tag
 * @param cmdName - The name of the command (eg. set, get, mset)
 * @param cmdArgs - Array of arguments passed to the command
 * @returns serialized string that will be used as the db.statement attribute.
 */
export type DbStatementSerializer = (cmdName: string, cmdArgs: Array<string | Buffer>) => string;

/**
 * Function that can be used to add custom attributes to span on response from redis server
 */
export interface RedisResponseCustomAttributeFunction {
  (span: Span, cmdName: string, cmdArgs: Array<string | Buffer>, response: unknown): void;
}

export interface RedisInstrumentationConfig extends InstrumentationConfig {
  /** Custom serializer function for the db.statement tag */
  dbStatementSerializer?: DbStatementSerializer;
  /** Function for adding custom attributes on db response */
  responseHook?: RedisResponseCustomAttributeFunction;
  /** Require parent to create redis span, default when unset is false */
  requireParentSpan?: boolean;
  /**
   * Controls which semantic-convention attributes are emitted on spans.
   * Default: 'OLD'.
   */
  semconvStability?: SemconvStability;
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
