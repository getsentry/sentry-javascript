import { SpanKind } from '@opentelemetry/api';
import { defineIntegration, spanToJSON } from '@sentry/core';
import { getSpanKind, getSpanScopes } from '@sentry/opentelemetry';

/**
 * This integration is responsible for creating isolation scopes for incoming Http requests.
 * We do so by waiting for http spans to be created and then forking the isolation scope.
 *
 * Normally the isolation scopes would be created by our Http instrumentation, however Next.js brings it's own Http
 * instrumentation so we had to disable ours.
 */
export const requestIsolationScopeIntegration = defineIntegration(() => {
  return {
    name: 'RequestIsolationScope',
    setup(client) {
      client.on('spanStart', span => {
        const spanJson = spanToJSON(span);

        // The following check is a heuristic to determine whether the started span is a span that tracks an incoming HTTP request
        if (getSpanKind(span) === SpanKind.SERVER && spanJson.data && 'http.method' in spanJson.data) {
          const scopes = getSpanScopes(span);
          if (scopes) {
            scopes.isolationScope = scopes.isolationScope.clone();
          }
        }
      });
    },
  };
});
