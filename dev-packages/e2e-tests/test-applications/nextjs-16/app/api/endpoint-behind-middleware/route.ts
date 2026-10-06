import { getDefaultIsolationScope } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';

export function GET() {
  // Streamed spans carry no scope tags, so the middleware test reads from these attributes whether the
  // isolation scope marked in `proxy.ts` leaked into this request
  const activeSpan = Sentry.getActiveSpan();
  if (activeSpan) {
    const isolationScope = Sentry.getIsolationScope();
    Sentry.getRootSpan(activeSpan).setAttributes({
      'isolation_scope.is_default': isolationScope === getDefaultIsolationScope(),
      'isolation_scope.has_proxy_marker': 'proxy-marker' in isolationScope.getScopeData().contexts,
    });
  }

  return Response.json({ name: 'John Doe' });
}
