import type { DynamicSamplingContext } from './envelope';

export type TracePropagationTargets = (string | RegExp)[];

/**
 * Context that contains details about distributed trace
 *
 * Generated from incoming `sentry-trace` and `baggage` headers.
 */
export interface PropagationContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
  dsc?: DynamicSamplingContext;
}
