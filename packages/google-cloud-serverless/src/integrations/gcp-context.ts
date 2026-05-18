import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, getCurrentScope, safeSetSpanJSONAttributes } from '@sentry/core';

const GCP_CONTEXT_ATTRIBUTE_MAP: Record<string, string> = {
  type: 'gcp.function.context.type',
  source: 'gcp.function.context.source',
  id: 'gcp.function.context.id',
  specversion: 'gcp.function.context.specversion',
  time: 'gcp.function.context.time',
  eventId: 'gcp.function.context.event_id',
  timestamp: 'gcp.function.context.timestamp',
  eventType: 'gcp.function.context.event_type',
  resource: 'gcp.function.context.resource',
};

const _gcpContextIntegration = (() => {
  return {
    name: 'GcpContext',
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
