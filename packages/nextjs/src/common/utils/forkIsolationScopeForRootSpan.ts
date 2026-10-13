import { context } from '@opentelemetry/api';
import type { RawAttributes, Span } from '@sentry/core';
import {
  getCapturedScopesOnSpan,
  getCurrentScope,
  getIsolationScope,
  getRootSpan,
  setCapturedScopesOnSpan,
} from '@sentry/core';
import { getScopesFromContext } from '@sentry/opentelemetry';
import { ATTR_NEXT_SPAN_TYPE } from '../nextSpanAttributes';

/**
 * Forks the isolation scope for `BaseServer.handleRequest` / `Middleware.execute` root spans so that request-scoped
 * data (e.g. `normalizedRequest`) stays isolated per request.
 */
export function maybeForkIsolationScopeForRootSpan(
  span: Span,
  spanAttributes: RawAttributes<Record<string, unknown>> | undefined,
): void {
  const spanType = spanAttributes?.[ATTR_NEXT_SPAN_TYPE];
  if (spanType !== 'BaseServer.handleRequest' && spanType !== 'Middleware.execute') {
    return;
  }

  if (span !== getRootSpan(span)) {
    return;
  }

  const scopes = getCapturedScopesOnSpan(span);

  const isolationScope = (scopes.isolationScope || getIsolationScope()).clone();
  const scope = scopes.scope || getCurrentScope();

  const currentScopesPointer = getScopesFromContext(context.active());
  if (currentScopesPointer) {
    currentScopesPointer.isolationScope = isolationScope;
  }

  setCapturedScopesOnSpan(span, scope, isolationScope);
}
