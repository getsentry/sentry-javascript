import { context } from '@opentelemetry/api';
import {
  suppressTracing as suppressTracingImpl,
  isTracingSuppressed as isTracingSuppressedImpl,
} from '@opentelemetry/core';
import type { Scope } from '@sentry/core';
import { getContextFromScope } from './contextData';

/** Suppress tracing in the given callback, ensuring no spans are generated inside of it. */
export function suppressTracing<T>(callback: () => T): T {
  const ctx = suppressTracingImpl(context.active());
  return context.with(ctx, callback);
}

export function isTracingSuppressed(scope?: Scope): boolean {
  const ctx = scope ? getContextFromScope(scope) : context.active();
  return ctx ? isTracingSuppressedImpl(ctx) : false;
}
