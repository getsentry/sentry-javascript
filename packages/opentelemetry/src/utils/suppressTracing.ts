import { context } from '@opentelemetry/api';
import { suppressTracing as suppressTracingImpl } from '@opentelemetry/core';

/** Suppress tracing in the given callback, ensuring no spans are generated inside of it. */
export function suppressTracing<T>(callback: () => T): T {
  const ctx = suppressTracingImpl(context.active());
  return context.with(ctx, callback);
}
