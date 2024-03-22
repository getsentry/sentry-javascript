import type { PropagationContext } from '@sentry/types';
import { uuid4 } from '@sentry/utils';

/**
 * Creates a new PropagationContext object with new traceId and spanId.
 */
export function generatePropagationContext(): PropagationContext {
  return {
    traceId: uuid4(),
    spanId: uuid4().substring(16),
  };
}
