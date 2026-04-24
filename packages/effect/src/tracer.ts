import type { Span } from '@sentry/core';
import { getActiveSpan, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan, withActiveSpan } from '@sentry/core';
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
  if (
    cause &&
    typeof cause === 'object' &&
    'reasons' in cause &&
    Array.isArray((cause as { reasons: unknown }).reasons)
  ) {
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
  if (cause && typeof cause === 'object' && '_tag' in cause) {
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

function createSentrySpan(
  name: string,
  parent: Option.Option<EffectTracer.AnySpan>,
  context: Context.Context<never>,
  links: ReadonlyArray<EffectTracer.SpanLink>,
  startTime: bigint,
  kind: EffectTracer.SpanKind,
): SentrySpanLike {
  const parentSentrySpan =
    Option.isSome(parent) && isSentrySpan(parent.value) ? parent.value.sentrySpan : (getActiveSpan() ?? null);

  const newSpan = startInactiveSpan({
    name,
    startTime: nanosToHrTime(startTime),
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: deriveOrigin(name),
    },
    ...(parentSentrySpan ? { parentSpan: parentSentrySpan } : {}),
  });

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
    if (cause && typeof cause === 'object' && 'reasons' in cause) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
})();

const makeSentryTracerV3 = (): EffectTracer.Tracer => {
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
      return createSentrySpan(name, parent, context, links, startTime, kind);
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

const makeSentryTracerV4 = (): EffectTracer.Tracer => {
  const EFFECT_EVALUATE = '~effect/Effect/evaluate' as const;

  return EffectTracer.make({
    span(options) {
      return createSentrySpan(
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
 * Effect Layer that sets up the Sentry tracer for Effect spans.
 */
export const SentryEffectTracer = isEffectV4 ? makeSentryTracerV4() : makeSentryTracerV3();
