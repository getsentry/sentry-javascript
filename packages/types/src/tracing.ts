import type { DynamicSamplingContext } from './envelope';

export type TracePropagationTargets = (string | RegExp)[];

export interface PropagationContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
  dsc?: DynamicSamplingContext;
}
