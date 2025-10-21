import type { Context, SerializedTraceData } from '@sentry/core';
import { getTraceMetaTags } from '@sentry/core';
import type { CapturedErrorContext, NitroAppPlugin, RenderResponse } from 'nitropack/types';

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
  if (typeof response.body === 'string') {
    const html = addMetaTagToHead(response.body, traceData);

    response.body = html;
    return;
  }
}

function addMetaTagToHead(html: string, traceData?: SerializedTraceData): string {
  const metaTags = getTraceMetaTags(traceData);
  if (!metaTags) {
    return html;
  }

  const content = `<head>\n${metaTags}\n`;

  return html.replace('<head>', content);
}

/**
 * Defines a Nitro plugin
 */
export function defineNitroPlugin(plugin: NitroAppPlugin): NitroAppPlugin {
  return plugin;
}
