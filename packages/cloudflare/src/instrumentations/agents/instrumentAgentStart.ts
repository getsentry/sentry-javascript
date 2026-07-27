import { debug, SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { AGENT_SPAN_ORIGIN, type AgentInternals, getAgentAttributes } from './types';

/**
 * Wraps the Agent's `onStart` lifecycle hook to create a span for the agent-start phase. The SDK
 * runs this once per isolate when the Agent boots, using it to restore persisted state, reconnect
 * MCP servers and recover in-flight work before the user's own `onStart` runs — so a single span
 * here captures that whole cold-start cost as one unit.
 */
export function instrumentAgentStart(obj: AgentInternals): void {
  const original = obj.onStart;
  if (typeof original !== 'function') {
    DEBUG_BUILD && debug.log('[Sentry] Agent `onStart` not found — agent-start span instrumentation skipped.');
    return;
  }

  obj.onStart = function (this: AgentInternals, ...args: unknown[]): unknown {
    return startSpan(
      {
        name: 'agent_start',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: AGENT_SPAN_ORIGIN,
          ...getAgentAttributes(this),
        },
      },
      () => original.apply(this, args),
    );
  };
}
