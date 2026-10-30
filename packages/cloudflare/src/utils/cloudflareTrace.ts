import { _INTERNAL_safeMathRandom, getCurrentScope, isContinuingTrace } from '@sentry/core';

interface CloudflareSpanContext {
  traceId: string;
  spanId: string;
}

// The part of `ctx.tracing` the SDK reads. `getActiveSpan` and `Span.spanContext` exist only in
// newer runtimes, so every member is optional.
interface CloudflareTracing {
  getActiveSpan?: () =>
    | {
        readonly isTraced?: boolean;
        spanContext?: () => CloudflareSpanContext;
      }
    | undefined;
}

const TRACE_ID_REGEXP = /^(?!0{32})[0-9a-f]{32}$/;
const SPAN_ID_REGEXP = /^(?!0{16})[0-9a-f]{16}$/;

/**
 * Sets the propagation context of the current scope to the Cloudflare trace of the invocation, so
 * errors, logs and spans get the trace id of the spans that Cloudflare exports.
 *
 * Does nothing when the current scope already continues a trace, for example an incoming Sentry
 * trace, when Cloudflare does not trace the invocation, or when the runtime does not expose
 * `Span.spanContext()`. The sampling decision is left to the SDK.
 */
export function continueCloudflareTrace(context: unknown): void {
  if (isContinuingTrace(getCurrentScope().getPropagationContext())) {
    return;
  }

  let spanContext: CloudflareSpanContext | undefined;
  try {
    const span = (context as { tracing?: CloudflareTracing } | undefined)?.tracing?.getActiveSpan?.();
    spanContext = span?.isTraced ? span.spanContext?.() : undefined;
  } catch {
    // Runtime getters on the execution context can throw on foreign or already-torn-down contexts.
    return;
  }

  if (!spanContext || !TRACE_ID_REGEXP.test(spanContext.traceId) || !SPAN_ID_REGEXP.test(spanContext.spanId)) {
    return;
  }

  // No `dsc` and no `sampled`: the SDK is the head of the Sentry trace, so it samples and builds
  // the dynamic sampling context itself.
  getCurrentScope().setPropagationContext({
    traceId: spanContext.traceId,
    parentSpanId: spanContext.spanId,
    sampleRand: _INTERNAL_safeMathRandom(),
  });
}
