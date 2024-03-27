import { SpanKind } from '@opentelemetry/api';
import { defineIntegration, spanToJSON } from '@sentry/core';
import { getSpanKind } from '@sentry/opentelemetry';

export const promoteHttpSpansIntegration = defineIntegration(() => ({
  name: 'PromoteHttpSpansIntegration',
  setup(client) {
    client.on('spanStart', span => {
      const spanJson = spanToJSON(span);

      // The following check is a heuristic to determine whether the started span is a span that tracks an incoming HTTP request
      if (getSpanKind(span) === SpanKind.SERVER && spanJson.data && 'http.method' in spanJson.data) {
        span.setAttribute('sentry.promoteToTransaction', true);
      }
    });
  },
}));
