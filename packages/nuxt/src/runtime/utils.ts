import { getActiveSpan, getRootSpan, spanToTraceHeader } from '@sentry/core';
import { getDynamicSamplingContextFromSpan } from '@sentry/opentelemetry';
import type { Context } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';
import { dynamicSamplingContextToSentryBaggageHeader } from '@sentry/utils';
import type { CapturedErrorContext } from 'nitropack';
import type { NuxtRenderHTMLContext } from 'nuxt/app';

/**
 *  Extracts the relevant context information from the error context (H3Event in Nitro Error)
 *  and created a structured context object.
 */
export function extractErrorContext(errorContext: CapturedErrorContext): Context {
  const structuredContext: Context = {
    method: undefined,
    path: undefined,
    tags: undefined,
  };

  if (errorContext) {
    if (errorContext.event) {
      structuredContext.method = errorContext.event._method || undefined;
      structuredContext.path = errorContext.event._path || undefined;
    }

    if (Array.isArray(errorContext.tags)) {
      structuredContext.tags = errorContext.tags || undefined;
    }
  }

  return dropUndefinedKeys(structuredContext);
}

/**
 * Adds Sentry tracing <meta> tags to the returned html page.
 *
 * Exported only for testing
 */
export function addSentryTracingMetaTags(head: NuxtRenderHTMLContext['head']): void {
  const activeSpan = getActiveSpan();
  const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;

  if (rootSpan) {
    const traceParentData = spanToTraceHeader(rootSpan);
    const dynamicSamplingContext = dynamicSamplingContextToSentryBaggageHeader(
      getDynamicSamplingContextFromSpan(rootSpan),
    );

    head.push(`<meta name="sentry-trace" content="${traceParentData}"/>`);
    head.push(`<meta name="baggage" content="${dynamicSamplingContext}"/>`);
  }
}
