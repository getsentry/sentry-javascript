// https://github.com/prisma/prisma/blob/d45607dfa10c4ef08cb8f79f18fa84ef33910150/packages/internals/src/tracing/types.ts#L1

import type { Context, Span, SpanOptions } from '@opentelemetry/api';

type V6SpanCallback<R> = (span?: Span, context?: Context) => R;

type V6ExtendedSpanOptions = SpanOptions & {
  name: string;
  internal?: boolean;
  middleware?: boolean;
  active?: boolean;
  context?: Context;
};

type V6EngineSpanId = string;

type V6HrTime = [number, number];

type EngineSpanKind = 'client' | 'internal';

type PrismaV6EngineSpan = {
  id: V6EngineSpanId;
  parentId: string | null;
  name: string;
  startTime: V6HrTime;
  endTime: V6HrTime;
  kind: EngineSpanKind;
  attributes?: Record<string, unknown>;
  links?: V6EngineSpanId[];
};

export interface PrismaV6TracingHelper {
  isEnabled(): boolean;
  getTraceParent(context?: Context): string;
  dispatchEngineSpans(spans: PrismaV6EngineSpan[]): void;
  getActiveContext(): Context | undefined;
  runInChildSpan<R>(nameOrOptions: string | V6ExtendedSpanOptions, callback: V6SpanCallback<R>): R;
}
