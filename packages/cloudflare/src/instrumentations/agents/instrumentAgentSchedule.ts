import { debug, SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import {
  AGENT_SCHEDULE_ID_ATTRIBUTE,
  AGENT_SPAN_ORIGIN,
  type AgentInternals,
  getAgentAttributes,
  type ScheduleRow,
  setAgentConversationId,
} from './types';

/**
 * Wraps the Agent's `_executeScheduleCallback` to create a span for each scheduled/queued callback
 * execution. Scheduled tasks run from the `alarm` handler; on Cloudflare that handler already starts
 * a fresh trace, so this span nests under it.
 *
 * Also sets the conversation id on the scope for the duration of the callback, so LLM calls made by
 * scheduled work are correlated with the agent instance just like interactive turns are.
 */
export function instrumentAgentSchedule(obj: AgentInternals): void {
  const original = obj._executeScheduleCallback;
  if (typeof original !== 'function') {
    DEBUG_BUILD &&
      debug.log('[Sentry] Agent `_executeScheduleCallback` not found — schedule span instrumentation skipped.');
    return;
  }

  obj._executeScheduleCallback = function (this: AgentInternals, row: ScheduleRow): unknown {
    const callbackName = row?.callback;

    if (typeof callbackName !== 'string') {
      return original.call(this, row);
    }

    const attributes: Record<string, string> = {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: AGENT_SPAN_ORIGIN,
      ...getAgentAttributes(this),
    };

    if (typeof row?.id === 'string') {
      attributes[AGENT_SCHEDULE_ID_ATTRIBUTE] = row.id;
    }

    return startSpan({ name: callbackName, attributes }, () => {
      setAgentConversationId(this);
      return original.call(this, row);
    });
  };
}
