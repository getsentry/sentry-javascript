import type { Tracer } from '@opentelemetry/api';
import type { BasicTracerProvider, Span as OtelSpan } from '@opentelemetry/sdk-trace-base';
import type { NodeClient, NodeOptions } from '@sentry/node';
import type { SpanOrigin, TransactionMetadata, TransactionSource } from '@sentry/types';

export type NodeExperimentalOptions = NodeOptions;
export type NodeExperimentalClientOptions = ConstructorParameters<typeof NodeClient>[0];

export interface NodeExperimentalClient extends NodeClient {
  tracer: Tracer;
  traceProvider: BasicTracerProvider | undefined;
  getOptions(): NodeExperimentalClientOptions;
}

export interface NodeExperimentalSpanContext {
  name: string;
  op?: string;
  metadata?: Partial<TransactionMetadata>;
  origin?: SpanOrigin;
  source?: TransactionSource;
}

export type { OtelSpan };
