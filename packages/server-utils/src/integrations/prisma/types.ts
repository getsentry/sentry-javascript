/*
 * Copyright Prisma
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/prisma/prisma/tree/b6feea5565ec577545a79547d24273ccdd11b4c7/packages/instrumentation-contract
 * - Upstream version: @prisma/instrumentation-contract@7.8.0
 * - Trimmed to the members the SDK's tracing helper relies on (dropped the unused `EngineTrace`,
 *   `EngineTraceEvent`, and `LogLevel` types)
 * - Replaced the `@opentelemetry/api` `SpanOptions` dependency with Sentry's own span types, so this
 *   package does not need to depend on OpenTelemetry
 */

import type { Span, SpanAttributes, SpanKind, SpanLink, SpanTimeInput } from '@sentry/core';

export type SpanCallback<R> = (span?: Span, parentSpan?: Span) => R;

export interface ExtendedSpanOptions {
  /** The name of the span */
  name: string;
  /* Internal spans are not shown unless PRISMA_SHOW_ALL_TRACES=true env var is set */
  internal?: boolean;
  /** Whether it propagates context (?=true) */
  active?: boolean;
  attributes?: SpanAttributes;
  kind?: SpanKind;
  links?: SpanLink[];
  startTime?: SpanTimeInput;
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

export interface TracingHelper {
  isEnabled(): boolean;
  getTraceParent(span?: Span): string;
  dispatchEngineSpans(spans: EngineSpan[]): void;
  getActiveContext(): Span | undefined;
  runInChildSpan<R>(nameOrOptions: string | ExtendedSpanOptions, callback: SpanCallback<R>): R;
}

export interface PrismaInstrumentationGlobalValue {
  helper?: TracingHelper;
}
