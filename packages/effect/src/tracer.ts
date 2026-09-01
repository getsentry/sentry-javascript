import { SENTRY_OP } from '@sentry/conventions/attributes';
import { FUNCTION, HTTP_CLIENT, HTTP_SERVER } from '@sentry/conventions/op';
import type { Span, StartSpanOptions } from '@sentry/core';
import {
  _INTERNAL_safeMathRandom,
  addNonEnumerableProperty,
  getActiveSpan,
  getCurrentScope,
  getDefaultCurrentScope,
  isObjectLike,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startNewTrace,
  withActiveSpan,
  withScope,
} from '@sentry/core';
import type * as Context from 'effect/Context';
import * as Exit from 'effect/Exit';
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

/**
 * Starts the Sentry span for an Effect span, rooted or parented the way Effect asked for.
 *
 * - A parent this tracer created becomes the Sentry parent.
 * - Any other parent (`Tracer.externalSpan` from incoming trace headers or persisted trace state, or a
 *   span from another Effect tracer) continues that trace: the new span is a root span whose
 *   `parent_span_id` is the external span. No dynamic sampling context is frozen, so the SDK builds
 *   one from the client the way it does for a head-of-trace span.
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
  newTraceForRootSpans: boolean,
): Span {
  if (Option.isSome(parent)) {
    const parentSpan = parent.value;

    if (isSentrySpan(parentSpan)) {
      return startInactiveSpan({ ...options, parentSpan: parentSpan.sentrySpan });
    }

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

  const activeSpan = getActiveSpan();
  if (activeSpan && !isEffectSpan(activeSpan)) {
    return startInactiveSpan({ ...options, parentSpan: activeSpan });
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
    newTraceForRootSpans,
  );
  markEffectSpan(newSpan);

  return new SentrySpanWrapper(name, parent, context, links, startTime, kind, newSpan);
}

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
    context(execution: () => unknown, fiber: { currentSpan?: EffectTracer.AnySpan }) {
      const currentSpan = fiber.currentSpan;
      if (currentSpan === undefined || !isSentrySpan(currentSpan)) {
        return execution();
      }
      return withActiveSpan(currentSpan.sentrySpan, execution);
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
      const currentSpan = fiber.currentSpan;
      if (currentSpan === undefined || !isSentrySpan(currentSpan)) {
        return primitive[EFFECT_EVALUATE](fiber);
      }
      return withActiveSpan(currentSpan.sentrySpan, () => primitive[EFFECT_EVALUATE](fiber));
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
