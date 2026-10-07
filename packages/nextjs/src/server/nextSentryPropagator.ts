import type { Context, TextMapSetter } from '@opentelemetry/api';
import { propagation } from '@opentelemetry/api';
import type { Span } from '@sentry/core';
import { getActiveSpan, spanToJSON } from '@sentry/core';
import { SentryPropagator } from '@sentry/opentelemetry';
import { ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../common/nextSpanAttributes';

const APP_RENDER_BODY_SPAN_TYPE = 'AppRender.getBodyResult';
const PRERENDER_ROUTE_SPAN_NAME_PREFIX = 'prerender route';

/**
 * Whether the span is the one Next.js wraps a prerender in. Next.js computes the `sentry-trace` and
 * `baggage` meta tags of a document inside that span, and a prerender produces a shell that is cached
 * and served to later visitors. A render for a request, including the resume of a prerendered shell,
 * computes the tags outside of it.
 */
export function isPrerenderSpan(span: Span | undefined): boolean {
  if (!span) {
    return false;
  }
  const { attributes } = spanToJSON(span);
  const spanName = attributes?.[ATTR_NEXT_SPAN_NAME];
  return (
    attributes?.[ATTR_NEXT_SPAN_TYPE] === APP_RENDER_BODY_SPAN_TYPE &&
    typeof spanName === 'string' &&
    spanName.startsWith(PRERENDER_ROUTE_SPAN_NAME_PREFIX)
  );
}

/**
 * A `SentryPropagator` that does not hand out trace context while Next.js prerenders a document.
 * Trace context baked into a prerendered shell would be replayed to every visitor the shell is
 * served to, so the browser could continue a trace that never handled its request.
 */
export class NextSentryPropagator extends SentryPropagator {
  /** @inheritDoc */
  public inject(ctx: Context, carrier: unknown, setter: TextMapSetter): void {
    if (isPrerenderSpan(getActiveSpan())) {
      return;
    }
    super.inject(ctx, carrier, setter);
  }
}

/**
 * Replaces the propagator the Node SDK registered with the Next.js-aware one.
 */
export function registerNextSentryPropagator(): void {
  // The OpenTelemetry API refuses a second global propagator, so the one from the Node SDK setup has
  // to be unregistered first.
  propagation.disable();
  propagation.setGlobalPropagator(new NextSentryPropagator());
}
