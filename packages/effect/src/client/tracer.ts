import { startInactiveSpan } from '@sentry/core/browser';
import { makeSentryTracer, makeTracerLayer } from '../tracer';

/**
 * Effect `Tracer` that records Effect spans as Sentry spans in browser clients.
 *
 * Wrapped in an arrow rather than passed by reference so the import binding is read per span. That
 * keeps the browser variant substitutable (mocks, bundler interop) exactly as it was when the tracer
 * called it directly.
 */
export const Tracer = makeSentryTracer(options => startInactiveSpan(options), false);

/**
 * Layer that records Effect spans as Sentry spans in browser clients.
 */
export const layerTracer = makeTracerLayer(Tracer);
