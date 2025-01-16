import type { PropagationContext } from '../types-hoist';
import { uuid4 } from './misc';

/**
 * Returns a new minimal propagation context.
 *
 * @deprecated Use `generateTraceId` and `generateSpanId` instead.
 */
export function generatePropagationContext(): PropagationContext {
  return {
    traceId: generateTraceId(),
    sampleRand: Math.random(),
  };
}

/**
 * Generate a random, valid trace ID.
 */
export function generateTraceId(): string {
  return uuid4();
}

/**
 * Generate a random, valid span ID.
 */
export function generateSpanId(): string {
  return uuid4().substring(16);
}
