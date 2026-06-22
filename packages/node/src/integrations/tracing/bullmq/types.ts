import type { Span } from '@opentelemetry/api';
import type { Scope } from '@sentry/core';

/**
 * Vendored from bullmq@5.79.1 — src/interfaces/telemetry.ts
 * https://github.com/taskforcesh/bullmq/blob/master/src/interfaces/telemetry.ts
 *
 * Minimal subset of BullMQ's Telemetry interface so we don't depend on bullmq at runtime.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2018 BullForce Labs AB and contributors
 */

export type AttributeValue = string | number | boolean | Array<string | number | boolean>;

export interface SpanOptions {
  kind?: number;
  attributes?: Record<string, AttributeValue>;
  parent?: unknown;
}

export interface TelemetrySpan {
  setAttribute(key: string, value: AttributeValue): void;
  setAttributes(attributes: Record<string, AttributeValue>): void;
  addEvent(name: string, attributes?: Record<string, AttributeValue>): void;
  recordException(exception: Error | string | { code?: number; message?: string; name?: string }): void;
  setSpanOnContext(context: unknown): unknown;
  end(): void;
}

export interface Tracer<Context> {
  startSpan(name: string, options?: SpanOptions, context?: Context): TelemetrySpan;
}

export interface ContextManager<Context> {
  active(): Context;
  with<A extends (...args: unknown[]) => unknown>(context: Context, fn: A): ReturnType<A>;
  getMetadata(context: Context): string;
  fromMetadata(activeContext: Context, metadata: string): Context;
}

export interface MetricOptions {
  description?: string;
  unit?: string;
}

export interface Counter {
  add(value: number, attributes?: Record<string, AttributeValue>): void;
}

export interface Histogram {
  record(value: number, attributes?: Record<string, AttributeValue>): void;
}

export interface Gauge {
  record(value: number, attributes?: Record<string, AttributeValue>): void;
}

export interface Meter {
  createCounter(name: string, options?: MetricOptions): Counter;
  createHistogram(name: string, options?: MetricOptions): Histogram;
  createGauge?(name: string, options?: MetricOptions): Gauge;
}

export interface Telemetry<Context> {
  tracer: Tracer<Context>;
  contextManager: ContextManager<Context>;
  meter?: Meter;
}

export interface SentryContext {
  span: Span | undefined;
  scope: Scope;
  producerSpanContext?: {
    traceId: string;
    spanId: string;
    sampled: boolean;
  };
}
