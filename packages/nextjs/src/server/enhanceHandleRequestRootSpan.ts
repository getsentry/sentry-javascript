import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_ROUTE,
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_TARGET,
} from '@opentelemetry/semantic-conventions';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, stripUrlQueryAndFragment } from '@sentry/core';
import { ATTR_NEXT_ROUTE, ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../common/nextSpanAttributes';
import { TRANSACTION_ATTR_SENTRY_ROUTE_BACKFILL } from '../common/span-attributes-with-logic-attached';

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

  attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] = 'http.server';
  span.setOp('http.server');

  const currentName = span.getName();
  if (currentName) {
    span.setName(stripUrlQueryAndFragment(currentName));
  }

  // eslint-disable-next-line deprecation/deprecation
  const method = attributes[SEMATTRS_HTTP_METHOD] ?? attributes[ATTR_HTTP_REQUEST_METHOD];
  // eslint-disable-next-line deprecation/deprecation
  const target = attributes[SEMATTRS_HTTP_TARGET];
  const route = attributes[ATTR_HTTP_ROUTE] || attributes[ATTR_NEXT_ROUTE];
  const spanName = attributes[ATTR_NEXT_SPAN_NAME];

  if (typeof method === 'string' && typeof route === 'string' && !route.startsWith('middleware')) {
    const cleanRoute = route.replace(/\/route$/, '');
    span.setName(`${method} ${cleanRoute}`);
    attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] = 'route';
    // Preserve next.route in case it did not get hoisted
    attributes[ATTR_NEXT_ROUTE] = cleanRoute;
  }

  // backfill transaction name for pages that would otherwise contain unparameterized routes
  const routeBackfill = attributes[TRANSACTION_ATTR_SENTRY_ROUTE_BACKFILL];
  if (typeof routeBackfill === 'string' && span.getName() !== 'GET /_app') {
    span.setName(`${typeof method === 'string' ? method : 'GET'} ${routeBackfill}`);
  }

  const middlewareMatch =
    typeof spanName === 'string' && spanName.match(/^middleware (GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)/);

  if (middlewareMatch) {
    span.setName(`middleware ${middlewareMatch[1]}`);
    span.setOp('http.server.middleware');
  }

  // Next.js overrides transaction names for page loads that throw an error
  // but we want to keep the original target name
  if (span.getName() === 'GET /_error' && typeof target === 'string') {
    span.setName(`${typeof method === 'string' ? `${method} ` : ''}${target}`);
  }
}
