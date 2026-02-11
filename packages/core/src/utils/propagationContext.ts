import { uuid4 } from './misc';

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
