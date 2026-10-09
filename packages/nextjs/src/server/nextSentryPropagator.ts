import type { Context, Span, SpanOptions, TextMapSetter, Tracer, TracerProvider } from '@opentelemetry/api';
import { context, createContextKey, propagation, trace } from '@opentelemetry/api';
import { SentryPropagator } from '@sentry/opentelemetry';
import { ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../common/nextSpanAttributes';

const APP_RENDER_BODY_SPAN_TYPE = 'AppRender.getBodyResult';
const PRERENDER_ROUTE_SPAN_NAME_PREFIX = 'prerender route';

const PRERENDER_CONTEXT_KEY = createContextKey('sentry.nextjs.prerender');

// Prerender spans started with `startSpan`, which the caller activates on a context of its own.
const prerenderSpans = new WeakSet<Span>();

/**
 * Whether these are the start arguments of the span Next.js wraps a prerender in. Next.js computes the
 * `sentry-trace` and `baggage` meta tags of a document inside that span, and a prerender produces a
 * shell that is cached and served to later visitors. A render for a request, including the resume of
 * a prerendered shell, computes the tags outside of it.
 */
export function isPrerenderSpanStart(name: string, options: SpanOptions | undefined): boolean {
  const attributes = options?.attributes;
  const spanName = attributes?.[ATTR_NEXT_SPAN_NAME] ?? name;
  return (
    attributes?.[ATTR_NEXT_SPAN_TYPE] === APP_RENDER_BODY_SPAN_TYPE &&
    typeof spanName === 'string' &&
    spanName.startsWith(PRERENDER_ROUTE_SPAN_NAME_PREFIX)
  );
}

/** Whether the context belongs to a prerender started through a tracer of a wrapped provider. */
export function isPrerenderContext(ctx: Context): boolean {
  if (ctx.getValue(PRERENDER_CONTEXT_KEY) === true) {
    return true;
  }
  const span = trace.getSpan(ctx);
  return !!span && prerenderSpans.has(span);
}

/**
 * Marks the context of a prerender span on the OpenTelemetry context rather than on the span. The
 * context is inherited by everything that runs inside the prerender, and it exists even when the
 * request is not sampled, in which case the prerender span is non-recording and carries no
 * attributes to recognize it by.
 */
function wrapTracer(tracer: Tracer): Tracer {
  return {
    startSpan: (name, options, ctx) => {
      const span = tracer.startSpan(name, options, ctx);
      if (isPrerenderSpanStart(name, options)) {
        prerenderSpans.add(span);
      }
      return span;
    },
    startActiveSpan: (name: string, ...args: unknown[]) => {
      const startActiveSpan = tracer.startActiveSpan.bind(tracer) as (name: string, ...args: unknown[]) => unknown;
      const options = typeof args[0] === 'function' ? undefined : (args[0] as SpanOptions | undefined);
      if (!isPrerenderSpanStart(name, options)) {
        return startActiveSpan(name, ...args);
      }

      const explicitContext = args.length === 3 ? (args[1] as Context) : undefined;
      if (explicitContext) {
        return startActiveSpan(name, args[0], explicitContext.setValue(PRERENDER_CONTEXT_KEY, true), args[2]);
      }
      return context.with(context.active().setValue(PRERENDER_CONTEXT_KEY, true), () => startActiveSpan(name, ...args));
    },
  };
}

/**
 * A `SentryPropagator` that does not hand out trace context while Next.js prerenders a document.
 * Trace context baked into a prerendered shell would be replayed to every visitor the shell is
 * served to, so the browser could continue a trace that never handled its request.
 */
export class NextSentryPropagator extends SentryPropagator {
  /** @inheritDoc */
  public inject(ctx: Context, carrier: unknown, setter: TextMapSetter): void {
    if (isPrerenderContext(ctx)) {
      return;
    }
    super.inject(ctx, carrier, setter);
  }
}

const markedProviders = new WeakSet<TracerProvider>();

/**
 * Makes a tracer provider mark prerenders on the OpenTelemetry context, by wrapping the tracers it hands
 * out. Safe to call repeatedly with the same provider, which the per-request `init` on Cloudflare does.
 */
export function markPrerendersOnTracerProvider(provider: TracerProvider): void {
  if (markedProviders.has(provider)) {
    return;
  }
  markedProviders.add(provider);

  const wrappedTracers = new WeakMap<Tracer, Tracer>();
  const getTracer = provider.getTracer.bind(provider);
  provider.getTracer = (...args) => {
    const tracer = getTracer(...args);
    let wrapped = wrappedTracers.get(tracer);
    if (!wrapped) {
      wrapped = wrapTracer(tracer);
      wrappedTracers.set(tracer, wrapped);
    }
    return wrapped;
  };
}

/**
 * The tracer provider behind the global OpenTelemetry API, which is a proxy around the registered one.
 */
export function getGlobalTracerProvider(): TracerProvider {
  const provider = trace.getTracerProvider();
  return 'getDelegate' in provider ? (provider as { getDelegate(): TracerProvider }).getDelegate() : provider;
}

/**
 * Makes the tracer provider the Node SDK registered mark prerenders on the OpenTelemetry context, and
 * replaces the propagator it registered with one that hands out nothing on a marked context.
 */
export function registerNextSentryPropagator(provider: TracerProvider): void {
  markPrerendersOnTracerProvider(provider);

  // The OpenTelemetry API refuses a second global propagator, so the one from the Node SDK setup has
  // to be unregistered first.
  propagation.disable();
  propagation.setGlobalPropagator(new NextSentryPropagator());
}
