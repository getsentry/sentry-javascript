/*
 * Copyright (c) 2023 oRPC
 * SPDX-License-Identifier: MIT
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/middleapi/orpc/blob/main/packages/shared/src/tracing.ts
 * - Upstream version: @orpc/shared@2.0.0-beta.51
 * - Only the types of the tracer contract are vendored, so the SDK does not depend on `@orpc/shared`
 */

export type ORPCTracingAttributeValue = string | number | boolean | string[] | number[] | boolean[];

export interface ORPCTracingException {
  name?: string;
  message: string;
  stack?: string;
  code?: string | number;
}

export type ORPCTracingHeaders = Record<string, string | string[] | undefined>;

export type ORPCTracingExceptionLevel = 'error' | 'info';

export interface ORPCTracingSpan {
  setAttribute(key: string, value: ORPCTracingAttributeValue): void;
  updateName(name: string): void;
  addEvent(name: string): void;
  recordException(level: ORPCTracingExceptionLevel, exception: ORPCTracingException): void;
  end(): void;
}

export interface ORPCTracer {
  startSpan(name: string, parent?: ORPCTracingSpan): ORPCTracingSpan;
  startActiveSpan<T>(
    name: string,
    parent: ORPCTracingSpan | undefined,
    fn: (span: ORPCTracingSpan) => Promise<T>,
  ): Promise<T>;
  getActiveSpan(): ORPCTracingSpan | undefined;
  withActiveSpan<T>(span: ORPCTracingSpan, fn: () => T | Promise<T>): T | Promise<T>;
  inject?(span: ORPCTracingSpan, headers: ORPCTracingHeaders): void;
  extract?(headers: ORPCTracingHeaders): ORPCTracingSpan | undefined;
}
