import {
  GCP_FUNCTION_CONTEXT_EVENT_ID,
  GCP_FUNCTION_CONTEXT_EVENT_TYPE,
  GCP_FUNCTION_CONTEXT_ID,
  GCP_FUNCTION_CONTEXT_RESOURCE,
  GCP_FUNCTION_CONTEXT_SOURCE,
  GCP_FUNCTION_CONTEXT_SPECVERSION,
  GCP_FUNCTION_CONTEXT_TIME,
  GCP_FUNCTION_CONTEXT_TIMESTAMP,
  GCP_FUNCTION_CONTEXT_TYPE,
} from '@sentry/conventions/attributes';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, getCurrentScope, safeSetSpanJSONAttributes } from '@sentry/core';

const GCP_CONTEXT_ATTRIBUTE_MAP: Record<string, string> = {
  type: GCP_FUNCTION_CONTEXT_TYPE,
  source: GCP_FUNCTION_CONTEXT_SOURCE,
  id: GCP_FUNCTION_CONTEXT_ID,
  specversion: GCP_FUNCTION_CONTEXT_SPECVERSION,
  time: GCP_FUNCTION_CONTEXT_TIME,
  eventId: GCP_FUNCTION_CONTEXT_EVENT_ID,
  timestamp: GCP_FUNCTION_CONTEXT_TIMESTAMP,
  eventType: GCP_FUNCTION_CONTEXT_EVENT_TYPE,
  resource: GCP_FUNCTION_CONTEXT_RESOURCE,
};

const _gcpContextIntegration = (() => {
  return {
    name: 'GcpContext' as const,
    processSegmentSpan(span) {
      const gcpContext = getCurrentScope().getScopeData().contexts['gcp.function.context'];
      if (!gcpContext) {
        return;
      }

      const attrs: Record<string, unknown> = {};
      for (const [field, attrName] of Object.entries(GCP_CONTEXT_ATTRIBUTE_MAP)) {
        const value = gcpContext[field];
        if (typeof value === 'string' || typeof value === 'number') {
          attrs[attrName] = value;
        }
      }
      safeSetSpanJSONAttributes(span, attrs);
    },
  };
}) satisfies IntegrationFn;

export const gcpContextIntegration = defineIntegration(_gcpContextIntegration);
