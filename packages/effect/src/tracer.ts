import type { Span } from '@sentry/core';
import {
  getActiveSpan,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
  withActiveSpan,
} from '@sentry/core';
import type * as Context from 'effect/Context';
import * as Exit from 'effect/Exit';
import type * as Layer from 'effect/Layer';
import { setTracer } from 'effect/Layer';
import * as Option from 'effect/Option';
import * as EffectTracer from 'effect/Tracer';

const KIND_MAP: Record<EffectTracer.SpanKind, 'internal' | 'server' | 'client' | 'producer' | 'consumer'> = {
  internal: 'internal',
  client: 'client',
  server: 'server',
  producer: 'producer',
  consumer: 'consumer',
};

function deriveOp(name: string, kind: EffectTracer.SpanKind): string {
  if (name.startsWith('http.server')) {
    return 'http.server';
  }
  if (name.startsWith('http.client')) {
    return 'http.client';
  }
  return KIND_MAP[kind];
}

function deriveOrigin(name: string): string {
  if (name.startsWith('http.server') || name.startsWith('http.client')) {
    return 'auto.http.effect';
  }

  return 'auto.function.effect';
}

function deriveSpanName(name: string, kind: EffectTracer.SpanKind): string {
  if (name.startsWith('http.server') && kind === 'server') {
    const isolationScope = getIsolationScope();
    const transactionName = isolationScope.getScopeData().transactionName;
    if (transactionName) {
      return transactionName;
    }
  }
  return name;
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

function isHttpServerSpan(span: Span): boolean {
  const op = spanToJSON(span).op;
  return op === 'http.server';
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
  public readonly ownsSpan: boolean;
  public readonly sentrySpan: Span;

  public constructor(
    public readonly name: string,
    parent: Option.Option<EffectTracer.AnySpan>,
    public readonly context: Context.Context<never>,
    links: ReadonlyArray<EffectTracer.SpanLink>,
    startTime: bigint,
    public readonly kind: EffectTracer.SpanKind,
    existingSpan: Span,
    ownsSpan: boolean,
  ) {
    this[SENTRY_SPAN_SYMBOL] = true as const;
    this._tag = 'Span' as const;
    this.attributes = new Map<string, unknown>();
    this.parent = parent;
    this.links = links.slice();
    this.sentrySpan = existingSpan;
    this.ownsSpan = ownsSpan;

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

  public addLinks(_links: ReadonlyArray<EffectTracer.SpanLink>): void {
    this.links.push(..._links);
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
      const cause = exit.cause;
      const message =
        cause._tag === 'Fail' ? String(cause.error) : cause._tag === 'Die' ? String(cause.defect) : 'internal_error';
      this.sentrySpan.setStatus({ code: 2, message });
    } else {
      this.sentrySpan.setStatus({ code: 1 });
    }

    if (this.ownsSpan) {
      this.sentrySpan.end(nanosToHrTime(endTime));
    }
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

  const spanName = deriveSpanName(name, kind);

  const newSpan = startInactiveSpan({
    name: spanName,
    op: deriveOp(name, kind),
    startTime: nanosToHrTime(startTime),
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: deriveOrigin(name),
    },
    ...(parentSentrySpan ? { parentSpan: parentSentrySpan } : {}),
  });

  return new SentrySpanWrapper(name, parent, context, links, startTime, kind, newSpan, true);
}

const makeSentryTracer = (): EffectTracer.Tracer =>
  EffectTracer.make({
    span(name, parent, context, links, startTime, kind) {
      return createSentrySpan(name, parent, context, links, startTime, kind);
    },
    context(execution, fiber) {
      const currentSpan = fiber.currentSpan;
      if (currentSpan === undefined || !isSentrySpan(currentSpan)) {
        return execution();
      }
      return withActiveSpan(currentSpan.sentrySpan, execution);
    },
  });

/**
 * Effect Layer that sets up the Sentry tracer for Effect spans.
 */
export const SentryEffectTracerLayer: Layer.Layer<never, never, never> = setTracer(makeSentryTracer());
