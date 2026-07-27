import { debug, SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import {
  AGENT_FIBER_ID_ATTRIBUTE,
  AGENT_FIBER_NAME_ATTRIBUTE,
  AGENT_SPAN_ORIGIN,
  type AgentInternals,
  getAgentAttributes,
} from './types';

/**
 * Wraps the Agent's `_runFiberInternal` to create a span for each managed fiber run. Fibers are the
 * SDK's durable background tasks (started via `runFiber`/`startFiber`); a single span spans the
 * fiber body plus the SDK's own snapshot/finalize storage phases. The `id` and `name` are the first
 * two positional arguments, mirroring the SDK's own signature.
 */
export function instrumentAgentFiber(obj: AgentInternals): void {
  const original = obj._runFiberInternal;
  if (typeof original !== 'function') {
    DEBUG_BUILD && debug.log('[Sentry] Agent `_runFiberInternal` not found — fiber span instrumentation skipped.');
    return;
  }

  obj._runFiberInternal = function (this: AgentInternals, id: string, name: string, ...rest: unknown[]): unknown {
    const attributes: Record<string, string> = {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: AGENT_SPAN_ORIGIN,
      ...getAgentAttributes(this),
    };

    if (typeof id === 'string' && id) {
      attributes[AGENT_FIBER_ID_ATTRIBUTE] = id;
    }
    if (typeof name === 'string' && name) {
      attributes[AGENT_FIBER_NAME_ATTRIBUTE] = name;
    }

    return startSpan({ name: typeof name === 'string' && name ? name : 'fiber', attributes }, () =>
      original.call(this, id, name, ...rest),
    );
  };
}
