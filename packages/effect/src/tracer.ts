/* oxlint-disable max-lines */
import { SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { HTTP_CLIENT, HTTP_SERVER } from '@sentry/conventions/op';
import type { Span, StartSpanOptions } from '@sentry/core';
import {
  _INTERNAL_safeMathRandom,
  addNonEnumerableProperty,
  getActiveSpan,
  getCurrentScope,
  getDefaultCurrentScope,
  isObjectLike,
  startNewTrace,
  timestampInSeconds,
  withActiveSpan,
  withScope,
} from '@sentry/core';
import * as Context from 'effect/Context';
import * as Exit from 'effect/Exit';
import type * as EffectLayer from 'effect/Layer';
import { succeed as succeedLayer } from 'effect/Layer';
import * as Option from 'effect/Option';
import * as EffectTracer from 'effect/Tracer';

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

const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE', 'PATCH']);

/**
 * Effect span names are chosen by whoever calls `Effect.withSpan`, so the name and the kind are the only
 * signals available. Effect names its HTTP spans `http.server <method>`/`http.client <method>` (Effect v3
 * and v4 before 4.0.2) or only `<method>` with a `server`/`client` kind (Effect 4.0.2 and later), which map
 * onto the matching Sentry ops. Every other span comes from user code or a third-party library, whose
 * semantics we cannot infer, so op and origin stay unset and the span keeps the core defaults: no op, and
 * a `manual` origin.
 */
function deriveOp(name: string, kind: EffectTracer.SpanKind): string | undefined {
  if (name.startsWith('http.server') || (kind === 'server' && HTTP_METHODS.has(name))) {
    return HTTP_SERVER;
  }

  if (name.startsWith('http.client') || (kind === 'client' && HTTP_METHODS.has(name))) {
    return HTTP_CLIENT;
  }

  return undefined;
}

const SENTRY_SPAN_SYMBOL = Symbol.for('@sentry/effect.SentrySpan');

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
  private readonly _sentryStartTime: number;

  public constructor(
    public readonly name: string,
    parent: Option.Option<EffectTracer.AnySpan>,
    public readonly context: Context.Context<never>,
    links: ReadonlyArray<EffectTracer.SpanLink>,
    startTime: bigint,
    public readonly kind: EffectTracer.SpanKind,
    existingSpan: Span,
    sentryStartTime: number,
  ) {
    this[SENTRY_SPAN_SYMBOL] = true as const;
    this._tag = 'Span' as const;
    this.attributes = new Map<string, unknown>();
    this.parent = parent;
    this.links = [...links];
    this.sentrySpan = existingSpan;
    this.annotations = context;
    this._sentryStartTime = sentryStartTime;

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

    this.sentrySpan.end(this._toSentryTime(endTime));
  }

  public event(name: string, startTime: bigint, attributes?: Record<string, unknown>): void {
    if (!this.sentrySpan.isRecording()) {
      return;
    }

    this.sentrySpan.addEvent(name, attributes as Parameters<Span['addEvent']>[1], this._toSentryTime(startTime));
  }

  /**
   * Converts an Effect time to Sentry's clock by adding its offset from the span's start.
   *
   * Effect's clock doesn't correct for clock drift (e.g. after the device slept), so its absolute times can be off
   * from the Sentry spans around this one. Its durations are still correct, and this way we also respect end times
   * that were passed explicitly.
   */
  private _toSentryTime(effectTime: bigint): number | undefined {
    // Effect passes 0 if tracer timing is disabled. Sentry then takes the current time.
    if (!effectTime || !this.status.startTime) {
      return undefined;
    }

    return this._sentryStartTime + Number(effectTime - this.status.startTime) / 1e9;
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

interface ContextExports {
  Reference: typeof Context.Reference;
  /** Only Effect v3 exports it. */
  GenericTag<Identifier, Service>(key: string): Context.Key<Identifier, Service>;
}

// Effect v4 has no `Context.GenericTag` and Effect v3 before 3.11 has no `Context.Reference`. Both are read
// through a separate binding because bundlers fail the build on a namespace member the installed version lacks.
const contextExports = Context as unknown as ContextExports;

/**
 * Whether the tracer continues the trace of a `Tracer.externalSpan` parent. Effect v4 has no `FiberRef`
 * and v3 before 3.11 has no `Context.Reference`, so the flag is a plain service in both. The cast is safe:
 * the tracer reads it with `getRef` only on a v4 fiber, where it is a reference, and with
 * `Context.getOption` on v3.
 */
const ExternalSpanFlag = (
  isEffectV4
    ? contextExports.Reference<boolean>(EXTERNAL_SPAN_KEY, { defaultValue: () => false })
    : contextExports.GenericTag<never, boolean>(EXTERNAL_SPAN_KEY)
) as Context.Reference<boolean>;

/**
 * Makes the tracer continue the trace of a `Tracer.externalSpan` parent instead of ignoring it. Provide it
 * next to the tracer layer to continue every external span in the runtime, or provide it to a single
 * effect with `Effect.provide` to continue only that one.
 */
export const SentryEffectExternalSpanLayer: EffectLayer.Layer<never> = succeedLayer(ExternalSpanFlag, true);

interface FiberLike {
  /** The span the fiber runs in. Only Effect v3 fibers have it. */
  readonly currentSpan?: EffectTracer.AnySpan | undefined;
  /** Holds `span`, the span the fiber runs in. Only Effect v4 fibers have it. */
  readonly cache?: { readonly span?: EffectTracer.AnySpan | undefined };
  /** Reads a reference with its default. Only Effect v4 fibers have it. */
  readonly getRef?: <A>(ref: Context.Reference<A>) => A;
  /** The services of the fiber. Only Effect v3 fibers have it. */
  readonly currentContext?: Context.Context<never>;
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

function getFiberSpan(fiber: FiberLike): EffectTracer.AnySpan | undefined {
  return isEffectV4 ? fiber.cache?.span : fiber.currentSpan;
}

function withFiberContext<X>(fiber: FiberLike, execution: () => X): X {
  const previousFiber = currentFiber;
  currentFiber = fiber;
  try {
    const currentSpan = getFiberSpan(fiber);
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
  newTraceForRootSpans: boolean,
): Span {
  if (Option.isSome(parent)) {
    const parentSpan = parent.value;

    if (isSentrySpan(parentSpan)) {
      return startInactiveSpan({ ...options, parentSpan: parentSpan.sentrySpan });
    }

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

    const enclosingSpan = currentFiber && getFiberSpan(currentFiber);
    if (enclosingSpan !== undefined && isSentrySpan(enclosingSpan)) {
      return startInactiveSpan({ ...options, parentSpan: enclosingSpan.sentrySpan });
    }
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
  const op = deriveOp(name, kind);
  const origin = op && 'auto.http.effect';

  // Effect calls the tracer when the span starts, so we start it on Sentry's clock and convert later Effect times
  // relative to this (see `_toSentryTime`).
  const sentryStartTime = timestampInSeconds();
  const newSpan = startSentrySpan(
    startInactiveSpan,
    {
      name,
      startTime: sentryStartTime,
      // Setting these to `undefined` would strip the core defaults instead of leaving them in place.
      attributes: {
        ...(op && { [SENTRY_OP]: op }),
        ...(origin && { [SENTRY_ORIGIN]: origin }),
      },
    },
    parent,
    newTraceForRootSpans,
  );
  markEffectSpan(newSpan);

  return new SentrySpanWrapper(name, parent, context, links, startTime, kind, newSpan, sentryStartTime);
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
