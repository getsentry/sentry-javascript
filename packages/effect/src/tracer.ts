/* oxlint-disable max-lines */
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { FUNCTION, HTTP_CLIENT, HTTP_SERVER } from '@sentry/conventions/op';
import type { Span, StartSpanOptions } from '@sentry/core';
import {
  _INTERNAL_safeMathRandom,
  addNonEnumerableProperty,
  continueTrace,
  getActiveSpan,
  getCurrentScope,
  getDefaultCurrentScope,
  isObjectLike,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startNewTrace,
  withActiveSpan,
  withScope,
} from '@sentry/core';
import * as Context from 'effect/Context';
import * as Exit from 'effect/Exit';
import type * as EffectLayer from 'effect/Layer';
import { succeed as succeedLayer } from 'effect/Layer';
import * as Option from 'effect/Option';
import * as EffectTracer from 'effect/Tracer';

function deriveOrigin(name: string): string {
  if (name.startsWith('http.server') || name.startsWith('http.client')) {
    return 'auto.http.effect';
  }

  return 'auto.function.effect';
}

const EFFECT_SPAN_SYMBOL = Symbol.for('@sentry/effect.EffectSpan');

function markEffectSpan(span: Span): void {
  addNonEnumerableProperty(span, EFFECT_SPAN_SYMBOL, true);
}

/**
 * Whether this tracer created the span. A brand rather than an attribute check, because an unsampled
 * span keeps no attributes.
 */
function isEffectSpan(span: Span): boolean {
  return (span as { [EFFECT_SPAN_SYMBOL]?: boolean })[EFFECT_SPAN_SYMBOL] === true;
}

/**
 * Effect span names are chosen by user code, so the name is the only signal available. `@effect/platform`
 * names its HTTP spans `http.server`/`http.client`, which map onto the matching Sentry ops; everything
 * else is arbitrary user work and falls back to `function`.
 */
function deriveOp(name: string): string {
  if (name.startsWith('http.server')) {
    return HTTP_SERVER;
  }

  if (name.startsWith('http.client')) {
    return HTTP_CLIENT;
  }

  return FUNCTION;
}

type HrTime = [number, number];

const SENTRY_SPAN_SYMBOL = Symbol.for('@sentry/effect.SentrySpan');

function nanosToHrTime(nanos: bigint): HrTime {
  const seconds = Number(nanos / BigInt(1_000_000_000));
  const remainingNanos = Number(nanos % BigInt(1_000_000_000));
  return [seconds, remainingNanos];
}

interface SentrySpanLike extends EffectTracer.Span {
  readonly [SENTRY_SPAN_SYMBOL]: true;
  readonly sentrySpan: Span;
}

function isSentrySpan(span: EffectTracer.AnySpan): span is SentrySpanLike {
  return SENTRY_SPAN_SYMBOL in span;
}

function getErrorMessage(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (!Exit.isFailure(exit)) {
    return undefined;
  }

  const cause = exit.cause as unknown;

  // Effect v4: cause.reasons is an array of Reason objects
  if (isObjectLike(cause) && 'reasons' in cause && Array.isArray((cause as { reasons: unknown }).reasons)) {
    const reasons = (cause as { reasons: Array<{ _tag?: string; error?: unknown; defect?: unknown }> }).reasons;
    for (const reason of reasons) {
      if (reason._tag === 'Fail' && reason.error !== undefined) {
        return String(reason.error);
      }
      if (reason._tag === 'Die' && reason.defect !== undefined) {
        return String(reason.defect);
      }
    }
    return 'internal_error';
  }

  // Effect v3: cause has _tag directly
  if (isObjectLike(cause) && '_tag' in cause) {
    const v3Cause = cause as { _tag: string; error?: unknown; defect?: unknown };
    if (v3Cause._tag === 'Fail') {
      return String(v3Cause.error);
    }
    if (v3Cause._tag === 'Die') {
      return String(v3Cause.defect);
    }
  }

  return 'internal_error';
}

class SentrySpanWrapper implements SentrySpanLike {
  public readonly [SENTRY_SPAN_SYMBOL]: true;
  public readonly _tag: 'Span';
  public readonly spanId: string;
  public readonly traceId: string;
  public readonly attributes: Map<string, unknown>;
  public readonly sampled: boolean;
  public readonly parent: Option.Option<EffectTracer.AnySpan>;
  public readonly links: Array<EffectTracer.SpanLink>;
  public status: EffectTracer.SpanStatus;
  public readonly sentrySpan: Span;
  public readonly annotations: Context.Context<never>;

  public constructor(
    public readonly name: string,
    parent: Option.Option<EffectTracer.AnySpan>,
    public readonly context: Context.Context<never>,
    links: ReadonlyArray<EffectTracer.SpanLink>,
    startTime: bigint,
    public readonly kind: EffectTracer.SpanKind,
    existingSpan: Span,
  ) {
    this[SENTRY_SPAN_SYMBOL] = true as const;
    this._tag = 'Span' as const;
    this.attributes = new Map<string, unknown>();
    this.parent = parent;
    this.links = [...links];
    this.sentrySpan = existingSpan;
    this.annotations = context;

    const spanContext = this.sentrySpan.spanContext();
    this.spanId = spanContext.spanId;
    this.traceId = spanContext.traceId;
    this.sampled = this.sentrySpan.isRecording();
    this.status = {
      _tag: 'Started',
      startTime,
    };
  }

  public attribute(key: string, value: unknown): void {
    if (!this.sentrySpan.isRecording()) {
      return;
    }

    this.sentrySpan.setAttribute(key, value as Parameters<Span['setAttribute']>[1]);
    this.attributes.set(key, value);
  }

  public addLinks(links: ReadonlyArray<EffectTracer.SpanLink>): void {
    this.links.push(...links);
  }

  public end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    this.status = {
      _tag: 'Ended',
      endTime,
      exit,
      startTime: this.status.startTime,
    };

    if (!this.sentrySpan.isRecording()) {
      return;
    }

    if (Exit.isFailure(exit)) {
      const message = getErrorMessage(exit) ?? 'internal_error';
      this.sentrySpan.setStatus({ code: 2, message });
    } else {
      this.sentrySpan.setStatus({ code: 1 });
    }

    this.sentrySpan.end(nanosToHrTime(endTime));
  }

  public event(name: string, startTime: bigint, attributes?: Record<string, unknown>): void {
    if (!this.sentrySpan.isRecording()) {
      return;
    }

    this.sentrySpan.addEvent(name, attributes as Parameters<Span['addEvent']>[1], nanosToHrTime(startTime));
  }
}

/**
 * The client and the server entry hand different `startInactiveSpan` functions to
 * {@link makeSentryTracer}: the browser one from `@sentry/core/browser`, which installs the span
 * streaming integration on first use, and the plain one from `@sentry/core`, which does not.
 */
export type StartInactiveSpan = (options: StartSpanOptions) => Span;

// Check if we're running Effect v4 by checking the Exit/Cause structure
// In v4, causes have a 'reasons' array
// In v3, causes have '_tag' directly on the cause object
const isEffectV4 = (() => {
  try {
    const testExit = Exit.fail('test') as unknown as { cause?: unknown };
    const cause = testExit.cause;
    // v4 causes have 'reasons' array, v3 causes have '_tag' directly
    if (isObjectLike(cause) && 'reasons' in cause) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
})();

const EXTERNAL_SPAN_KEY = '@sentry/effect/ExternalSpan';

interface EffectV3Context {
  GenericTag<Identifier, Service>(key: string): Context.Key<Identifier, Service>;
}

/**
 * Whether the tracer continues the trace of a `Tracer.externalSpan` parent. Effect v4 has no `FiberRef`
 * and v3 has no `Context.Reference`, so the flag is a plain service in both. The cast is safe: the tracer
 * reads it with `getRef` only on a v4 fiber, where it is a reference, and with `Context.getOption` on v3.
 */
const ExternalSpanFlag = (
  isEffectV4
    ? Context.Reference<boolean>(EXTERNAL_SPAN_KEY, { defaultValue: () => false })
    : (Context as unknown as EffectV3Context).GenericTag<never, boolean>(EXTERNAL_SPAN_KEY)
) as Context.Reference<boolean>;

/**
 * Makes the tracer continue the trace of a `Tracer.externalSpan` parent instead of ignoring it. Provide it
 * next to the tracer layer to continue every external span in the runtime, or provide it to a single
 * effect with `Effect.provide` to continue only that one.
 */
export const SentryEffectExternalSpanLayer: EffectLayer.Layer<never> = succeedLayer(ExternalSpanFlag, true);

interface FiberLike {
  readonly currentSpan?: EffectTracer.AnySpan | undefined;
  /** Reads a reference with its default. Only Effect v4 fibers have it. */
  readonly getRef?: <A>(ref: Context.Reference<A>) => A;
  /** The services of the fiber. Only Effect v4 fibers have it. */
  readonly context?: Context.Context<never>;
  /** The services of the fiber. Only Effect v3 fibers have it. */
  readonly currentContext?: Context.Context<never>;
}

interface HttpServerRequestLike {
  readonly headers: Readonly<Record<string, string | undefined>>;
}

/**
 * The request service the HTTP server puts into the fiber context before its tracer middleware starts the
 * `http.server` span: `@effect/platform` on Effect v3, `effect/unstable/http` on v4. Looked up by key, so
 * the tracer depends on neither package.
 */
const HttpServerRequestKey = isEffectV4
  ? Context.Service<never, HttpServerRequestLike>('effect/http/HttpServerRequest')
  : (Context as unknown as EffectV3Context).GenericTag<never, HttpServerRequestLike>(
      '@effect/platform/HttpServerRequest',
    );

function getRequestHeaders(fiber: FiberLike): HttpServerRequestLike['headers'] | undefined {
  const context = fiber.context ?? fiber.currentContext;
  if (context === undefined) {
    return undefined;
  }

  return Option.getOrUndefined(Context.getOption(context, HttpServerRequestKey))?.headers;
}

/**
 * The fiber whose operation is being evaluated. Effect hands the fiber to the `context` hook but not to
 * `span`, which runs synchronously inside it, so the hook keeps the fiber here for that extent.
 */
let currentFiber: FiberLike | undefined;

function continuesExternalSpans(fiber: FiberLike): boolean {
  if (fiber.getRef) {
    return fiber.getRef(ExternalSpanFlag);
  }

  return (
    fiber.currentContext !== undefined &&
    Option.getOrElse(Context.getOption(fiber.currentContext, ExternalSpanFlag), () => false)
  );
}

function withFiberContext<X>(fiber: FiberLike, execution: () => X): X {
  const previousFiber = currentFiber;
  currentFiber = fiber;
  try {
    const currentSpan = fiber.currentSpan;
    if (currentSpan === undefined || !isSentrySpan(currentSpan)) {
      return execution();
    }
    return withActiveSpan(currentSpan.sentrySpan, execution);
  } finally {
    currentFiber = previousFiber;
  }
}

/**
 * Starts the Sentry span for an Effect span, rooted or parented the way Effect asked for.
 *
 * - A parent this tracer created becomes the Sentry parent.
 * - The `http.server` span of an Effect HTTP server continues the trace of the incoming request from its
 *   `sentry-trace` and `baggage` headers through `continueTrace`, like a request in the Node SDK, so the
 *   dynamic sampling context and the `strictTraceContinuation` checks apply. The parent Effect parsed from
 *   a `traceparent` or `b3` header is the fallback without `sentry-trace`. A server span under a foreign
 *   active Sentry span keeps nesting under it, because that span already continued the trace.
 * - Any other parent (`Tracer.externalSpan` bridging a trace this SDK did not start, such as an
 *   OpenTelemetry span of another app in the same process or persisted trace state) is ignored unless
 *   {@link SentryEffectExternalSpanLayer} is provided, so a span joins a foreign trace only when the user
 *   asked for it. The span then nests where Effect would have put it without the `parent` option: under
 *   the fiber's current span, or parentless. With the layer, the span continues that trace: it is a root
 *   span whose `parent_span_id` is the external span. No dynamic sampling context is frozen, so the SDK
 *   builds one from the client the way it does for a head-of-trace span.
 * - Without a parent, the span nests under a foreign active Sentry span (an `http.server` span from the
 *   Node SDK, a pageload in the browser) but never under a span this tracer created: Effect's own parent
 *   tracking is authoritative for those, so an active one is an enclosing `root: true` span or a span
 *   leaked from another fiber through the async context. Effect reports `root: true` for every
 *   parentless span, so the flag adds nothing and is not consulted.
 * - A root span starts a new trace when `newTraceForRootSpans` is set, unless the user set up the
 *   current scope (`Sentry.continueTrace`, `Sentry.withScope`, an HTTP request's isolation scope).
 */
function startSentrySpan(
  startInactiveSpan: StartInactiveSpan,
  options: StartSpanOptions,
  parent: Option.Option<EffectTracer.AnySpan>,
  kind: EffectTracer.SpanKind,
  newTraceForRootSpans: boolean,
): Span {
  if (Option.isSome(parent) && isSentrySpan(parent.value)) {
    return startInactiveSpan({ ...options, parentSpan: parent.value.sentrySpan });
  }

  const activeSpan = getActiveSpan();
  const foreignActiveSpan = activeSpan && !isEffectSpan(activeSpan) ? activeSpan : undefined;

  if (kind === 'server' && foreignActiveSpan === undefined && currentFiber !== undefined) {
    const headers = getRequestHeaders(currentFiber);
    if (headers !== undefined) {
      const externalParent = Option.getOrUndefined(parent);
      const sentryTrace =
        headers['sentry-trace'] ??
        (externalParent && `${externalParent.traceId}-${externalParent.spanId}-${externalParent.sampled ? '1' : '0'}`);

      return continueTrace({ sentryTrace, baggage: headers['baggage'] }, () => startInactiveSpan(options));
    }
  }

  if (Option.isSome(parent)) {
    const parentSpan = parent.value;

    if (currentFiber !== undefined && continuesExternalSpans(currentFiber)) {
      return withScope(scope => {
        scope.setPropagationContext({
          traceId: parentSpan.traceId,
          parentSpanId: parentSpan.spanId,
          sampled: parentSpan.sampled,
          sampleRand: _INTERNAL_safeMathRandom(),
        });
        return withActiveSpan(null, () => startInactiveSpan(options));
      });
    }

    const enclosingSpan = currentFiber?.currentSpan;
    if (enclosingSpan !== undefined && isSentrySpan(enclosingSpan)) {
      return startInactiveSpan({ ...options, parentSpan: enclosingSpan.sentrySpan });
    }
  }

  if (foreignActiveSpan !== undefined) {
    return startInactiveSpan({ ...options, parentSpan: foreignActiveSpan });
  }

  // A scope the user forked (`continueTrace`, `withScope`, an isolation scope) carries its own trace id.
  // The scopes this tracer forks in `context()` clone the propagation context they were forked from, so
  // even when one leaks into another fiber through the async context it still carries the process-wide
  // trace id of the default scope.
  const isProcessTrace =
    getCurrentScope().getPropagationContext().traceId === getDefaultCurrentScope().getPropagationContext().traceId;
  if (newTraceForRootSpans && isProcessTrace) {
    return startNewTrace(() => startInactiveSpan(options));
  }

  return withActiveSpan(null, () => startInactiveSpan(options));
}

function createSentrySpan(
  startInactiveSpan: StartInactiveSpan,
  newTraceForRootSpans: boolean,
  name: string,
  parent: Option.Option<EffectTracer.AnySpan>,
  context: Context.Context<never>,
  links: ReadonlyArray<EffectTracer.SpanLink>,
  startTime: bigint,
  kind: EffectTracer.SpanKind,
): SentrySpanLike {
  const newSpan = startSentrySpan(
    startInactiveSpan,
    {
      name,
      startTime: nanosToHrTime(startTime),
      attributes: {
        [SENTRY_OP]: deriveOp(name),
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: deriveOrigin(name),
      },
    },
    parent,
    kind,
    newTraceForRootSpans,
  );
  markEffectSpan(newSpan);

  return new SentrySpanWrapper(name, parent, context, links, startTime, kind, newSpan);
}

const makeSentryTracerV3 = (
  startInactiveSpan: StartInactiveSpan,
  newTraceForRootSpans: boolean,
): EffectTracer.Tracer => {
  // Effect v3 API: span(name, parent, context, links, startTime, kind)
  return EffectTracer.make({
    span(
      name: string,
      parent: Option.Option<EffectTracer.AnySpan>,
      context: Context.Context<never>,
      links: ReadonlyArray<EffectTracer.SpanLink>,
      startTime: bigint,
      kind: EffectTracer.SpanKind,
    ) {
      return createSentrySpan(startInactiveSpan, newTraceForRootSpans, name, parent, context, links, startTime, kind);
    },
    context(execution: () => unknown, fiber: FiberLike) {
      return withFiberContext(fiber, execution);
    },
  } as unknown as EffectTracer.Tracer);
};

const makeSentryTracerV4 = (
  startInactiveSpan: StartInactiveSpan,
  newTraceForRootSpans: boolean,
): EffectTracer.Tracer => {
  const EFFECT_EVALUATE = '~effect/Effect/evaluate' as const;

  return EffectTracer.make({
    span(options) {
      return createSentrySpan(
        startInactiveSpan,
        newTraceForRootSpans,
        options.name,
        options.parent,
        options.annotations,
        options.links,
        options.startTime,
        options.kind,
      );
    },
    context(primitive, fiber) {
      return withFiberContext(fiber, () => primitive[EFFECT_EVALUATE](fiber));
    },
  });
};

/**
 * Creates an Effect `Tracer` that records Effect spans as Sentry spans.
 *
 * Use the `SentryEffectTracer` exported from `@sentry/effect` rather than calling this directly — the
 * client and server entries each bind the right `startInactiveSpan` for their platform.
 *
 * `newTraceForRootSpans` is the one behavioural difference between the platforms: Effect gives every
 * parentless span a fresh trace id, and on a long-lived server nothing else forks the propagation
 * context, so the server tracer follows Effect and starts a new trace. In the browser the page trace is
 * the intended home of every span, so the client tracer keeps parentless spans in it.
 */
export function makeSentryTracer(
  startInactiveSpan: StartInactiveSpan,
  newTraceForRootSpans: boolean,
): EffectTracer.Tracer {
  return isEffectV4
    ? makeSentryTracerV4(startInactiveSpan, newTraceForRootSpans)
    : makeSentryTracerV3(startInactiveSpan, newTraceForRootSpans);
}
