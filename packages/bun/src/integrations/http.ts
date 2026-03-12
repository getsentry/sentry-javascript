import { captureException } from '@sentry/core';
import type { IntegrationFn, Span, StartSpanOptions } from '@sentry/types';
import { generateTraceId } from '@sentry/utils';

const SENSITIVE_HEADERS = new Set([
  'set-cookie',
  'cookie',
  'authorization',
  'www-authenticate',
  'proxy-authorization',
  'proxy-authenticate',
]);

function sanitizeHeaders(headers: Record<string, string | string[] | undefined> | undefined): Record<string, string | string[] | undefined> | undefined {
  if (!headers) return headers;
  const sanitized: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      sanitized[key] = '[Filtered]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export const httpIntegration = (): IntegrationFn => {
  return {
    name: 'Http',
    setupOnce() {},
  processEvent(event) {
      if (event.contexts?.response?.headers) {
        event.contexts.response.headers = sanitizeHeaders(event.contexts.response.headers as Record<string, string | string[] | undefined>);
      }
      return event;
    },
  };
};
