import { SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { HTTP_SERVER, RPC } from '@sentry/conventions/op';
import type { Span, SpanAttributes, StartSpanOptions } from '@sentry/core';
import {
  continueTrace,
  getActiveSpan,
  getClient,
  getIsolationScope,
  getRootSpan,
  getTraceData,
  INTERNAL_setSegmentNameSourceIfSegment,
  SPAN_STATUS_ERROR,
  spanToJSON,
  startInactiveSpan,
  startSpanManual,
  updateSpanName,
  withActiveSpan,
} from '@sentry/core';
import type {
  ORPCTracer,
  ORPCTracingAttributeValue,
  ORPCTracingException,
  ORPCTracingExceptionLevel,
  ORPCTracingHeaders,
  ORPCTracingSpan,
} from './types';

export const ORPC_ORIGIN = 'auto.rpc.orpc';

// The span name prefix oRPC uses for procedure calls, both on the client and for a routed server request.
const PROCEDURE_SPAN_PREFIX = 'orpc.';

const ORPC_TRACER_KEY = Symbol.for('ORPC_TRACER');

export class SentryORPCSpan implements ORPCTracingSpan {
  public constructor(public readonly span: Span) {}

  public setAttribute(key: string, value: ORPCTracingAttributeValue): void {
    this.span.setAttribute(key, value);
  }

  // oRPC renames only the server request span, once the request is routed to a procedure.
  public updateName(name: string): void {
    this.span.updateName(name);

    if (!name.startsWith(PROCEDURE_SPAN_PREFIX)) {
      return;
    }

    this.span.setAttribute(SENTRY_OP, RPC);
    INTERNAL_setSegmentNameSourceIfSegment(this.span, 'route');

    // The request URL is not a good transaction name: OpenAPI routes contain path params.
    const rootSpan = getRootSpan(this.span);
    if (rootSpan !== this.span && spanToJSON(rootSpan).attributes[SENTRY_OP] === HTTP_SERVER) {
      updateSpanName(rootSpan, name);
      INTERNAL_setSegmentNameSourceIfSegment(rootSpan, 'route');
    }
    getIsolationScope().setTransactionName(name);
  }

  public addEvent(name: string): void {
    this.span.addEvent(name);
  }

  public recordException(level: ORPCTracingExceptionLevel, _exception: ORPCTracingException): void {
    // Issues are captured by the integration from the original error, the exception here is a lossy copy.
    if (level === 'error') {
      this.span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    }
  }

  public end(): void {
    this.span.end();
  }
}

/** The trace context of an incoming request, returned by `extract` and used as the parent of the request span. */
class RemoteParent implements ORPCTracingSpan {
  public constructor(
    public readonly sentryTrace: string,
    public readonly baggage: string | undefined,
  ) {}

  public setAttribute(): void {}
  public updateName(): void {}
  public addEvent(): void {}
  public recordException(): void {}
  public end(): void {}
}

export interface SentryORPCTracerOptions {
  /**
   * Whether oRPC links write `sentry-trace` and `baggage` headers into outgoing requests.
   *
   * Off by default: the SDK's `fetch` and `http` instrumentation already propagates the trace for the
   * HTTP transports, and headers written by oRPC would parent the server to the oRPC client span rather
   * than to the outgoing `http.client` span. oRPC does not tell the tracer the request URL either, so
   * `tracePropagationTargets` cannot be applied here.
   */
  injectTraceHeaders?: boolean;
}

/**
 * An oRPC v2 tracer that records oRPC's spans with Sentry's span APIs.
 */
export class SentryORPCTracer implements ORPCTracer {
  public readonly inject: ORPCTracer['inject'];

  public constructor(options: SentryORPCTracerOptions = {}) {
    if (options.injectTraceHeaders) {
      this.inject = injectTraceHeaders;
    }
  }

  public startSpan(name: string, parent?: ORPCTracingSpan): ORPCTracingSpan {
    return withParent(parent, parentSpan => new SentryORPCSpan(startInactiveSpan(spanOptions(name, parentSpan))));
  }

  public startActiveSpan<T>(
    name: string,
    parent: ORPCTracingSpan | undefined,
    fn: (span: ORPCTracingSpan) => Promise<T>,
  ): Promise<T> {
    // oRPC ends the span itself, so it is started with `startSpanManual`.
    return withParent(parent, parentSpan =>
      startSpanManual(spanOptions(name, parentSpan), span => fn(new SentryORPCSpan(span))),
    );
  }

  public getActiveSpan(): ORPCTracingSpan | undefined {
    const span = getActiveSpan();
    return span ? new SentryORPCSpan(span) : undefined;
  }

  public withActiveSpan<T>(span: ORPCTracingSpan, fn: () => T | Promise<T>): T | Promise<T> {
    return span instanceof SentryORPCSpan ? withActiveSpan(span.span, fn) : fn();
  }

  public extract(headers: ORPCTracingHeaders): ORPCTracingSpan | undefined {
    // When the HTTP server instrumentation has already continued the incoming trace, the request span is its child.
    if (getActiveSpan()) {
      return undefined;
    }

    const sentryTrace = firstHeaderValue(headers['sentry-trace']);
    if (!sentryTrace) {
      return undefined;
    }

    const baggage = headers.baggage;
    return new RemoteParent(sentryTrace, Array.isArray(baggage) ? baggage.join(',') : baggage);
  }
}

/** Installs the Sentry tracer as oRPC's global tracer. */
export function setORPCTracer(tracer: ORPCTracer | undefined): void {
  (globalThis as Record<symbol, unknown>)[ORPC_TRACER_KEY] = tracer;
}

function withParent<T>(parent: ORPCTracingSpan | undefined, start: (parentSpan: Span | undefined) => T): T {
  if (parent instanceof RemoteParent) {
    return continueTrace({ sentryTrace: parent.sentryTrace, baggage: parent.baggage }, () => start(undefined));
  }
  // A span of another tracer (e.g. one installed while a request was running) falls back to the active span.
  return start(parent instanceof SentryORPCSpan ? parent.span : undefined);
}

function spanOptions(name: string, parentSpan: Span | undefined): StartSpanOptions {
  const attributes: SpanAttributes = { [SENTRY_ORIGIN]: ORPC_ORIGIN };
  // oRPC starts a client procedure call span with its final name, a server request span is renamed once routed.
  if (name.startsWith(PROCEDURE_SPAN_PREFIX)) {
    attributes[SENTRY_OP] = RPC;
  }
  return { name, attributes, parentSpan };
}

function injectTraceHeaders(span: ORPCTracingSpan, headers: ORPCTracingHeaders): void {
  if (!(span instanceof SentryORPCSpan)) {
    return;
  }

  const traceData = getTraceData({
    span: span.span,
    propagateTraceparent: getClient()?.getOptions().propagateTraceparent,
  });

  for (const [key, value] of Object.entries(traceData)) {
    if (value && headers[key] === undefined) {
      headers[key] = value;
    }
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
