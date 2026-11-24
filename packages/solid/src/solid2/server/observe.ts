import {
  CODE_FUNCTION_NAME,
  HTTP_REQUEST_METHOD,
  HTTP_ROUTE,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_SEGMENT_NAME_SOURCE,
  URL_PATH_PARAMETER_KEY_BASE,
} from '@sentry/conventions/attributes';
import { FUNCTION, HTTP_SERVER } from '@sentry/conventions/op';
import {
  defineIntegration,
  getActiveSpan,
  getDefaultIsolationScope,
  getIsolationScope,
  getRootSpan,
  SPAN_STATUS_ERROR,
  spanToJSON,
  startInactiveSpan,
  updateSpanName,
} from '@sentry/core';
import type { InvocationEvent, RenderEvent } from '@solidjs/web';
import { OBSERVE } from 'solid-js';

const INTEGRATION_NAME = 'SolidServerObserve';

// Record times are `performance.now()` values; spans take seconds since the epoch.
function toTimestamp(at: number): number {
  return (performance.timeOrigin + at) / 1000;
}

/** A span for a server function execution, under the span of the request or render that ran it. */
function recordInvocationSpan({ id, at, durationMs, outcome }: InvocationEvent): void {
  const span = startInactiveSpan({
    name: id,
    startTime: toTimestamp(at),
    onlyIfParent: true,
    attributes: {
      [SENTRY_OP]: FUNCTION,
      [SENTRY_ORIGIN]: 'auto.function.solid.server_function',
      [CODE_FUNCTION_NAME]: id,
    },
  });
  if (outcome === 'error') {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  }
  span.end(toTimestamp(at + durationMs));
}

/**
 * Names the `http.server` span after the route the router declared for the render, e.g. `GET /user/:id`, unless it
 * is named after a route already (by `withSentryRouterRouting`).
 */
function nameRequestAfterRenderRoute({ route }: RenderEvent): void {
  const activeSpan = getActiveSpan();
  if (!route?.name || !activeSpan) {
    return;
  }

  const rootSpan = getRootSpan(activeSpan);
  const { attributes } = spanToJSON(rootSpan);
  if (
    attributes?.[SENTRY_OP] !== HTTP_SERVER ||
    attributes[SENTRY_SEGMENT_NAME_SOURCE] === 'route' ||
    !rootSpan.isRecording()
  ) {
    return;
  }

  const method = attributes[HTTP_REQUEST_METHOD];
  const name = `${typeof method === 'string' ? method : 'GET'} ${route.name}`;
  updateSpanName(rootSpan, name);
  rootSpan.setAttributes({
    [HTTP_ROUTE]: route.name,
    [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
  });
  for (const [key, value] of Object.entries(route.params ?? {})) {
    if (typeof value === 'string') {
      rootSpan.setAttribute(`${URL_PATH_PARAMETER_KEY_BASE}.${key}`, value);
    }
  }

  // Outside a request, the isolation scope is shared by the whole process.
  const isolationScope = getIsolationScope();
  if (isolationScope !== getDefaultIsolationScope()) {
    isolationScope.setTransactionName(name);
  }
}

/**
 * Turns the records of Solid's observe and dev builds into Sentry data: a span for every server function execution,
 * and the route of a render as the name of its request span, with any router. Production builds have no records, so
 * this does nothing there.
 */
export const solidServerObserveIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      // Solid keeps one entry per listener function, so a client set up per request on Workers adds no duplicates.
      OBSERVE?.records.subscribe('invocation', recordInvocationSpan);
      OBSERVE?.records.subscribe('render', nameRequestAfterRenderRoute);
    },
  };
});
