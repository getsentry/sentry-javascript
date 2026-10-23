import type { Context, Span, SpanOptions, Tracer, TracerProvider } from '@opentelemetry/api';
import { context, createContextKey, trace } from '@opentelemetry/api';
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
 *
 * @internal
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

/**
 * Whether the context belongs to a prerender started through a tracer of a marked provider.
 *
 * @internal
 */
export function isPrerenderContext(ctx: Context): boolean {
  if (ctx.getValue(PRERENDER_CONTEXT_KEY) === true) {
    return true;
  }
  const span = trace.getSpan(ctx);
  return !!span && prerenderSpans.has(span);
}

/**
 * Marks a prerender on the OpenTelemetry context rather than on the span. The context is inherited by
 * everything that runs inside the prerender, and it exists even when the request is not sampled, in
 * which case the prerender span is non-recording and carries no attributes to recognize it by.
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

const markedProviders = new WeakSet<TracerProvider>();

/**
 * Makes a tracer provider mark prerenders of Next.js on the OpenTelemetry context, by wrapping the
 * tracers it hands out. `NextSentryPropagator` relies on the mark. The SDK calls this for the provider it
 * registers; an app that sets up OpenTelemetry itself calls it with its own provider. Safe to call
 * repeatedly with the same provider, which the per-request `init` on Cloudflare does.
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
 *
 * @internal
 */
export function getGlobalTracerProvider(): TracerProvider {
  const provider = trace.getTracerProvider();
  return 'getDelegate' in provider ? (provider as { getDelegate(): TracerProvider }).getDelegate() : provider;
}
