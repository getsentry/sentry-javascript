import type { Context, TextMapSetter, TracerProvider } from '@opentelemetry/api';
import { propagation } from '@opentelemetry/api';
import { SentryPropagator } from '@sentry/opentelemetry';
import { isPrerenderContext, markPrerendersOnTracerProvider } from './prerenderContext';

/**
 * A `SentryPropagator` that does not hand out the trace meta tags of a document while Next.js
 * prerenders it. Trace context baked into a prerendered shell would be replayed to every visitor the
 * shell is served to, so the browser could continue a trace that never handled its request.
 *
 * The SDK registers it when it sets up OpenTelemetry. An app that sets up OpenTelemetry itself
 * registers it in place of `SentryPropagator` and calls `markPrerendersOnTracerProvider` with its
 * tracer provider, which this propagator relies on to recognize a prerender.
 */
export class NextSentryPropagator extends SentryPropagator {
  /** @inheritDoc */
  public inject(ctx: Context, carrier: unknown, setter: TextMapSetter): void {
    // Next.js collects the meta tag values into an array; every other caller, such as the outgoing
    // request instrumentations, passes a headers object and keeps propagating during a prerender.
    if (Array.isArray(carrier) && isPrerenderContext(ctx)) {
      return;
    }
    super.inject(ctx, carrier, setter);
  }
}

/**
 * Makes the tracer provider the Node SDK registered mark prerenders on the OpenTelemetry context, and
 * replaces the propagator it registered with one that hands out no meta tags on a marked context.
 */
export function registerNextSentryPropagator(provider: TracerProvider): void {
  markPrerendersOnTracerProvider(provider);

  // The OpenTelemetry API refuses a second global propagator, so the one from the Node SDK setup has
  // to be unregistered first.
  propagation.disable();
  propagation.setGlobalPropagator(new NextSentryPropagator());
}
