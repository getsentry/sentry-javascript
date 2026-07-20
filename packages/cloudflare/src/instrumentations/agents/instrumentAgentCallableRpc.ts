import { debug, SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { AGENT_SPAN_ORIGIN, type AgentInternals, getAgentAttributes, setAgentConversationId } from './types';

/**
 * Wraps the Agent's `onMessage` handler to create a span for each `@callable()` RPC invocation.
 * RPC requests arrive as WebSocket messages, so this span nests under the active transaction for
 * the WebSocket message (on Cloudflare, the instrumented Durable Object `webSocketMessage` hook).
 *
 * Also sets the conversation id on the scope for the duration of the call: callable methods are the
 * unit of work for plain (non-chat) agents, which run LLM calls just like chat turns do.
 */
export function instrumentAgentCallableRpc(obj: AgentInternals): void {
  const original = obj.onMessage;
  if (typeof original !== 'function') {
    DEBUG_BUILD && debug.log('[Sentry] Agent `onMessage` not found — callable RPC span instrumentation skipped.');
    return;
  }

  obj.onMessage = function (this: AgentInternals, ...args: unknown[]): unknown {
    const method = extractCallableMethod(args[1]);

    if (!method) {
      return original.apply(this, args);
    }

    return startSpan(
      {
        name: method,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'rpc',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: AGENT_SPAN_ORIGIN,
          ...getAgentAttributes(this),
        },
      },
      () => {
        setAgentConversationId(this);
        return original.apply(this, args);
      },
    );
  };
}

/** Extracts the RPC method name from a WebSocket message, mirroring the SDK's `isRPCRequest`. */
function extractCallableMethod(message: unknown): string | undefined {
  const text =
    typeof message === 'string'
      ? message
      : message instanceof ArrayBuffer
        ? new TextDecoder().decode(message)
        : undefined;

  if (!text) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as { type?: unknown; method?: unknown; args?: unknown };
    if (parsed.type === 'rpc' && typeof parsed.method === 'string' && Array.isArray(parsed.args)) {
      return parsed.method;
    }
  } catch {
    // Not JSON, or not an RPC request — no span.
  }

  return undefined;
}
