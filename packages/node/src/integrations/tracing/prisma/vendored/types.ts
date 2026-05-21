/*
 * Copyright Prisma
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
 * - Vendored from: https://github.com/prisma/prisma/tree/b6feea5565ec577545a79547d24273ccdd11b4c7/packages/instrumentation-contract
 * - Upstream version: @prisma/instrumentation-contract@7.8.0
 */
/* eslint-disable */

import type { Context, Span, SpanOptions } from '@opentelemetry/api';

export type SpanCallback<R> = (span?: Span, context?: Context) => R;

export interface ExtendedSpanOptions extends SpanOptions {
  /** The name of the span */
  name: string;
  /* Internal spans are not shown unless PRISMA_SHOW_ALL_TRACES=true env var is set */
  internal?: boolean;
  /** Whether it propagates context (?=true) */
  active?: boolean;
  /** The context to append the span to */
  context?: Context;
}

export type EngineSpanId = string;

export type HrTime = [number, number];

export type EngineSpanKind = 'client' | 'internal';

export type EngineSpan = {
  id: EngineSpanId;
  parentId: string | null;
  name: string;
  startTime: HrTime;
  endTime: HrTime;
  kind: EngineSpanKind;
  attributes?: Record<string, unknown>;
  links?: EngineSpanId[];
};

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'query';

export interface EngineTraceEvent {
  spanId: EngineSpanId;
  target?: string;
  level: LogLevel;
  timestamp: HrTime;
  attributes: Record<string, unknown> & {
    message?: string;
    query?: string;
    duration_ms?: number;
    params?: string;
  };
}

export interface EngineTrace {
  spans: EngineSpan[];
  events: EngineTraceEvent[];
}

export interface TracingHelper {
  isEnabled(): boolean;
  getTraceParent(context?: Context): string;
  dispatchEngineSpans(spans: EngineSpan[]): void;

  getActiveContext(): Context | undefined;

  runInChildSpan<R>(nameOrOptions: string | ExtendedSpanOptions, callback: SpanCallback<R>): R;
}

export interface PrismaInstrumentationGlobalValue {
  helper?: TracingHelper;
}
