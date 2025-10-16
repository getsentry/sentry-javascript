import type { Context, SerializedTraceData } from '@sentry/core';
import { getTraceMetaTags } from '@sentry/core';
import type { CapturedErrorContext, RenderResponse } from 'nitropack/types';

/**
 *  Extracts the relevant context information from the error context (H3Event in Nitro Error)
 *  and created a structured context object.
 */
export function extractErrorContext(errorContext: CapturedErrorContext | undefined): Context {
  const ctx: Context = {};

  if (!errorContext) {
    return ctx;
  }

  if (errorContext.event) {
    ctx.method = errorContext.event._method;
    ctx.path = errorContext.event._path;
  }

  if (Array.isArray(errorContext.tags)) {
    ctx.tags = errorContext.tags;
  }

  return ctx;
}

/**
 * Adds Sentry tracing <meta> tags to the returned html page.
 *
 * Exported only for testing
 */
export function addSentryTracingMetaTags(response: Partial<RenderResponse>, traceData?: SerializedTraceData): void {
  const body = response.body as NodeJS.ReadableStream;
  const decoder = new TextDecoder();
  response.body = new ReadableStream({
    start: async controller => {
      for await (const chunk of body) {
        const html = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
        const modifiedHtml = addMetaTagToHead(html, traceData);
        controller.enqueue(new TextEncoder().encode(modifiedHtml));
      }
      controller.close();
    },
  });
}

function addMetaTagToHead(html: string, traceData?: SerializedTraceData): string {
  const metaTags = getTraceMetaTags(traceData);
  if (!metaTags) {
    return html;
  }

  const content = `<head>\n${metaTags}\n`;

  return html.replace('<head>', content);
}
