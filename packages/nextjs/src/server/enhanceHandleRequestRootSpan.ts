import {
  HTTP_METHOD,
  HTTP_REQUEST_METHOD,
  HTTP_ROUTE,
  HTTP_TARGET,
  SENTRY_OP,
  SENTRY_SEGMENT_NAME_SOURCE,
  URL_PATH,
} from '@sentry/conventions/attributes';
import { HTTP_SERVER, MIDDLEWARE } from '@sentry/conventions/op';
import { stripUrlQueryAndFragment } from '@sentry/core';
import { ATTR_NEXT_ROUTE, ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../common/nextSpanAttributes';
import { TRANSACTION_ATTR_SENTRY_ROUTE_BACKFILL } from '../common/span-attributes-with-logic-attached';
import { backfillHttpResponseStatusCode } from '../common/utils/backfillHttpResponseStatusCode';

export interface MutableRootSpan {
  attributes: Record<string, unknown>;
  getName(): string | undefined;
  setName(name: string): void;
  setOp(op: string): void;
}

/**
 * Normalizes name, op and source for the root span of a Next.js `BaseServer.handleRequest` request.
 *
 * Called from two places that operate on different shapes of the same underlying root span:
 * - Legacy mode: from `preprocessEvent`, adapted around a transaction `Event` whose `contexts.trace.data`
 *   holds the root span's attributes and whose `event.transaction` is the root span's name.
 * - Streamed mode: from `processSegmentSpan`, adapted around a `StreamedSpanJSON` (the streamed
 *   counterpart of the legacy transaction root) directly.
 *
 * The `MutableRootSpan` adapter hides those differences so the enhancement logic can be shared.
 */
export function enhanceHandleRequestRootSpan(span: MutableRootSpan): void {
  const { attributes } = span;

  if (attributes[ATTR_NEXT_SPAN_TYPE] !== 'BaseServer.handleRequest') {
    return;
  }

  attributes[SENTRY_OP] = HTTP_SERVER;
  span.setOp(HTTP_SERVER);

  backfillHttpResponseStatusCode(attributes);

  const currentName = span.getName();
  if (currentName) {
    span.setName(stripUrlQueryAndFragment(currentName));
  }

  // eslint-disable-next-line typescript/no-deprecated
  const method = attributes[HTTP_REQUEST_METHOD] ?? attributes[HTTP_METHOD];
  // `http.target` is only read for spans from a user's own OpenTelemetry instrumentation, which
  // still emits the old semantic conventions; the SDK sets `url.path`.
  // eslint-disable-next-line typescript/no-deprecated
  const target = attributes[URL_PATH] ?? attributes[HTTP_TARGET];
  const route = attributes[HTTP_ROUTE] || attributes[ATTR_NEXT_ROUTE];
  const spanName = attributes[ATTR_NEXT_SPAN_NAME];

  if (typeof method === 'string' && typeof route === 'string' && !route.startsWith('middleware')) {
    const cleanRoute = route.replace(/\/route$/, '');
    span.setName(`${method} ${cleanRoute}`);
    attributes[SENTRY_SEGMENT_NAME_SOURCE] = 'route';
    attributes[HTTP_ROUTE] = cleanRoute;
    // Preserve next.route in case it did not get hoisted
    attributes[ATTR_NEXT_ROUTE] = cleanRoute;
  }

  // backfill transaction name for pages that would otherwise contain unparameterized routes
  const routeBackfill = attributes[TRANSACTION_ATTR_SENTRY_ROUTE_BACKFILL];
  if (typeof routeBackfill === 'string' && span.getName() !== 'GET /_app') {
    span.setName(`${typeof method === 'string' ? method : 'GET'} ${routeBackfill}`);
    attributes[SENTRY_SEGMENT_NAME_SOURCE] = 'route';
    attributes[HTTP_ROUTE] = attributes[HTTP_ROUTE] ?? routeBackfill;
  }

  const middlewareMatch =
    typeof spanName === 'string' && spanName.match(/^middleware (GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)/);

  if (middlewareMatch) {
    span.setName(`middleware ${middlewareMatch[1]}`);
    span.setOp(MIDDLEWARE);
    attributes[SENTRY_SEGMENT_NAME_SOURCE] = 'route';
  }

  // Next.js overrides transaction names for page loads that throw an error
  // but we want to keep the original target name
  if (span.getName() === 'GET /_error' && typeof target === 'string') {
    span.setName(`${typeof method === 'string' ? `${method} ` : ''}${target}`);
  }
}
