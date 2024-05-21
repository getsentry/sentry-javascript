import type { PropagationContext } from '@sentry/types';
import { uuid4 } from './misc';

/**
 * Returns a new minimal propagation context
 */
export function generatePropagationContext(): PropagationContext {
  return {
    traceId: uuid4(),
    spanId: uuid4().substring(16),
  };
}
