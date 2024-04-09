import { SpanKind } from '@opentelemetry/api';
import {
  defineIntegration,
  getCapturedScopesOnSpan,
  getCurrentScope,
  getIsolationScope,
  getRootSpan,
  setCapturedScopesOnSpan,
  spanToJSON,
} from '@sentry/core';
import { getSpanKind } from '@sentry/opentelemetry';

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
        const data = spanJson.data || {};

        // The following check is a heuristic to determine whether the started span is a span that tracks an incoming HTTP request
        if (
          (getSpanKind(span) === SpanKind.SERVER && data['http.method']) ||
          (span === getRootSpan(span) && data['next.route'])
        ) {
          const scopes = getCapturedScopesOnSpan(span);

          // Update the isolation scope, isolate this request
          const isolationScope = (scopes.isolationScope || getIsolationScope()).clone();
          const scope = scopes.scope || getCurrentScope();

          setCapturedScopesOnSpan(span, scope, isolationScope);
        }
      });
    },
  };
});
