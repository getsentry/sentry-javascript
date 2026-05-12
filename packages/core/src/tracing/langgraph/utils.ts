import { captureException } from '../../exports';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { SPAN_STATUS_ERROR } from '../../tracing';
import type { Span, SpanAttributes } from '../../types-hoist/span';
import {
  GEN_AI_AGENT_NAME_ATTRIBUTE,
  GEN_AI_EXECUTE_TOOL_OPERATION_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_TOOL_CALL_ID_ATTRIBUTE,
  GEN_AI_TOOL_INPUT_ATTRIBUTE,
  GEN_AI_TOOL_OUTPUT_ATTRIBUTE,
  GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE,
  GEN_AI_TOOL_NAME_ATTRIBUTE,
  GEN_AI_TOOL_TYPE_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import type { BaseChatModel, LangChainMessage } from '../langchain/types';
import { normalizeLangChainMessages } from '../langchain/utils';
import { startSpan } from '../trace';
import { LANGGRAPH_ORIGIN } from './constants';
import type { CompiledGraph, LangGraphOptions, LangGraphTool } from './types';

/**
 * Extract LLM model object from createReactAgent params
 */
export function extractLLMFromParams(args: unknown[]): BaseChatModel | null {
  const arg = args[0];
  if (typeof arg !== 'object' || !arg || !('llm' in arg) || !arg.llm || typeof arg.llm !== 'object') {
    return null;
  }
  const llm = arg.llm as BaseChatModel;
  if (typeof llm.modelName !== 'string' && typeof llm.model !== 'string') {
    return null;
  }
  return llm;
}

/**
 * Extract agent name from createReactAgent params
 */
export function extractAgentNameFromParams(args: unknown[]): string | null {
  const arg = args[0];
  if (typeof arg === 'object' && !!arg && 'name' in arg && typeof arg.name === 'string') {
    return arg.name;
  }
  return null;
}

/**
 * Wraps an array of LangChain tools so each invocation creates a gen_ai.execute_tool span.
 *
 * Wraps each tool's invoke() method in place. A marker prevents double-wrapping.
 */
export function wrapToolsWithSpans(tools: unknown[], options: LangGraphOptions, agentName?: string): unknown[] {
  const SENTRY_WRAPPED = '__sentry_tool_wrapped__';

  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') {
      continue;
    }

    const t = tool as Record<string, unknown>;
    const originalInvoke = t.invoke;
    if (typeof originalInvoke !== 'function' || Object.prototype.hasOwnProperty.call(t, SENTRY_WRAPPED)) {
      continue;
    }

    const toolName = typeof t.name === 'string' ? t.name : 'unknown_tool';
    const toolDescription = typeof t.description === 'string' ? t.description : undefined;

    const wrappedInvoke = new Proxy(originalInvoke as (...args: unknown[]) => unknown, {
      apply(target, thisArg, args: unknown[]): unknown {
        const spanAttributes: SpanAttributes = {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: LANGGRAPH_ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: GEN_AI_EXECUTE_TOOL_OPERATION_ATTRIBUTE,
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'execute_tool',
          [GEN_AI_TOOL_NAME_ATTRIBUTE]: toolName,
          [GEN_AI_TOOL_TYPE_ATTRIBUTE]: 'function',
        };

        // Read agent name from LangChain's propagated config metadata at call time,
        // so shared tools get the correct agent name for each invocation
        const callConfig = args[1] as Record<string, unknown> | undefined;
        const callAgentName = (callConfig?.metadata as Record<string, unknown>)?.lc_agent_name ?? agentName;
        if (typeof callAgentName === 'string') {
          spanAttributes[GEN_AI_AGENT_NAME_ATTRIBUTE] = callAgentName;
        }

        if (toolDescription) {
          spanAttributes[GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE] = toolDescription;
        }

        // LangGraph ToolNode passes { name, args, id, type: "tool_call" }
        const input = args[0] as Record<string, unknown> | undefined;
        if (typeof input === 'object' && !!input) {
          if ('id' in input && typeof input.id === 'string') {
            spanAttributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE] = input.id;
          }

          if (options.recordInputs) {
            const toolArgs = 'args' in input && typeof input.args === 'object' ? input.args : input;
            try {
              spanAttributes[GEN_AI_TOOL_INPUT_ATTRIBUTE] = JSON.stringify(toolArgs);
            } catch {
              // skip if not serializable
            }
          }
        }

        return startSpan(
          {
            op: GEN_AI_EXECUTE_TOOL_OPERATION_ATTRIBUTE,
            name: `execute_tool ${toolName}`,
            attributes: spanAttributes,
          },
          async span => {
            try {
              const result = await Reflect.apply(target, thisArg, args);

              if (options.recordOutputs) {
                try {
                  // ToolMessage objects wrap the result in .content
                  const resultObj = result as Record<string, unknown> | undefined;
                  const content =
                    resultObj && typeof resultObj === 'object' && 'content' in resultObj ? resultObj.content : result;
                  span.setAttribute(
                    GEN_AI_TOOL_OUTPUT_ATTRIBUTE,
                    typeof content === 'string' ? content : JSON.stringify(content),
                  );
                } catch {
                  // skip if not serializable
                }
              }

              return result;
            } catch (error) {
              span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
              captureException(error, {
                mechanism: {
                  handled: false,
                  type: 'auto.ai.langgraph.error',
                },
              });
              throw error;
            }
          },
        );
      },
    });

    t.invoke = wrappedInvoke;
    Object.defineProperty(t, SENTRY_WRAPPED, { value: true, enumerable: false });
  }

  return tools;
}

/**
 * Extract tool calls from messages
 */
export function extractToolCalls(messages: Array<Record<string, unknown>> | null): unknown[] | null {
  if (!messages || messages.length === 0) {
    return null;
  }

  const toolCalls: unknown[] = [];

  for (const message of messages) {
    if (message && typeof message === 'object') {
      const msgToolCalls = message.tool_calls;
      if (msgToolCalls && Array.isArray(msgToolCalls)) {
        toolCalls.push(...msgToolCalls);
      }
    }
  }

  return toolCalls.length > 0 ? toolCalls : null;
}

/**
 * Extract token usage from a message's usage_metadata or response_metadata
 * Returns token counts without setting span attributes
 */
export function extractTokenUsageFromMessage(message: LangChainMessage): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const msg = message as Record<string, unknown>;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  // Extract from usage_metadata (newer format)
  if (msg.usage_metadata && typeof msg.usage_metadata === 'object') {
    const usage = msg.usage_metadata as Record<string, unknown>;
    if (typeof usage.input_tokens === 'number') {
      inputTokens = usage.input_tokens;
    }
    if (typeof usage.output_tokens === 'number') {
      outputTokens = usage.output_tokens;
    }
    if (typeof usage.total_tokens === 'number') {
      totalTokens = usage.total_tokens;
    }
    return { inputTokens, outputTokens, totalTokens };
  }

  // Fallback: Extract from response_metadata.tokenUsage
  if (msg.response_metadata && typeof msg.response_metadata === 'object') {
    const metadata = msg.response_metadata as Record<string, unknown>;
    if (metadata.tokenUsage && typeof metadata.tokenUsage === 'object') {
      const tokenUsage = metadata.tokenUsage as Record<string, unknown>;
      if (typeof tokenUsage.promptTokens === 'number') {
        inputTokens = tokenUsage.promptTokens;
      }
      if (typeof tokenUsage.completionTokens === 'number') {
        outputTokens = tokenUsage.completionTokens;
      }
      if (typeof tokenUsage.totalTokens === 'number') {
        totalTokens = tokenUsage.totalTokens;
      }
    }
  }

  return { inputTokens, outputTokens, totalTokens };
}

/**
 * Extract model and finish reason from a message's response_metadata
 */
export function extractModelMetadata(span: Span, message: LangChainMessage): void {
  const msg = message as Record<string, unknown>;

  if (msg.response_metadata && typeof msg.response_metadata === 'object') {
    const metadata = msg.response_metadata as Record<string, unknown>;

    if (metadata.model_name && typeof metadata.model_name === 'string') {
      span.setAttribute(GEN_AI_RESPONSE_MODEL_ATTRIBUTE, metadata.model_name);
    }

    if (metadata.finish_reason && typeof metadata.finish_reason === 'string') {
      span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE, [metadata.finish_reason]);
    }
  }
}

/**
 * Extract tools from compiled graph structure
 *
 * Tools are stored in: compiledGraph.builder.nodes.tools.runnable.tools
 */
export function extractToolsFromCompiledGraph(compiledGraph: CompiledGraph): unknown[] | null {
  if (!compiledGraph.builder?.nodes?.tools?.runnable?.tools) {
    return null;
  }

  const tools = compiledGraph.builder?.nodes?.tools?.runnable?.tools;

  if (!tools || !Array.isArray(tools) || tools.length === 0) {
    return null;
  }

  // Extract name, description, and schema from each tool's lc_kwargs
  return tools.map((tool: LangGraphTool) => ({
    name: tool.lc_kwargs?.name,
    description: tool.lc_kwargs?.description,
    schema: tool.lc_kwargs?.schema,
  }));
}

/**
 * Set response attributes on the span
 */
export function setResponseAttributes(span: Span, inputMessages: LangChainMessage[] | null, result: unknown): void {
  // Extract messages from result
  const resultObj = result as { messages?: LangChainMessage[] } | undefined;
  const outputMessages = resultObj?.messages;

  if (!outputMessages || !Array.isArray(outputMessages)) {
    return;
  }

  // Get new messages (delta between input and output)
  const inputCount = inputMessages?.length ?? 0;
  const newMessages = outputMessages.length > inputCount ? outputMessages.slice(inputCount) : [];

  if (newMessages.length === 0) {
    return;
  }

  // Extract and set tool calls from new messages BEFORE normalization
  // (normalization strips tool_calls, so we need to extract them first)
  const toolCalls = extractToolCalls(newMessages as Array<Record<string, unknown>>);
  if (toolCalls) {
    span.setAttribute(GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE, JSON.stringify(toolCalls));
  }

  // Normalize the new messages
  const normalizedNewMessages = normalizeLangChainMessages(newMessages);
  span.setAttribute(GEN_AI_RESPONSE_TEXT_ATTRIBUTE, JSON.stringify(normalizedNewMessages));

  // Accumulate token usage across all messages
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;

  // Extract metadata from messages
  for (const message of newMessages) {
    // Accumulate token usage
    const tokens = extractTokenUsageFromMessage(message);
    totalInputTokens += tokens.inputTokens;
    totalOutputTokens += tokens.outputTokens;
    totalTokens += tokens.totalTokens;

    // Extract model metadata (last message's metadata wins for model/finish_reason)
    extractModelMetadata(span, message);
  }

  // Set accumulated token usage on span
  if (totalInputTokens > 0) {
    span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE, totalInputTokens);
  }
  if (totalOutputTokens > 0) {
    span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE, totalOutputTokens);
  }
  if (totalTokens > 0) {
    span.setAttribute(GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE, totalTokens);
  }
}

/** Duck-types a LangChain `CallbackManager` — `instanceof` is unreliable when `@langchain/core` is bundled or deduped. */
function isCallbackManager(value: unknown): value is {
  addHandler: (handler: unknown, inherit?: boolean) => void;
  copy: () => unknown;
  handlers?: unknown[];
  inheritableHandlers?: unknown[];
} {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { addHandler?: unknown; copy?: unknown };
  return typeof candidate.addHandler === 'function' && typeof candidate.copy === 'function';
}

/**
 * Merge `sentryHandler` into a langchain `callbacks` value (undefined, `BaseCallbackHandler[]`, or `BaseCallbackManager`).
 *
 * Wrapping a `CallbackManager` into `[manager, sentryHandler]` would make LangChain treat the whole manager
 * as one opaque handler and drop its inheritable children — notably LangGraph's `StreamMessagesHandler`,
 * which silently breaks per-token streaming. We register on a `.copy()` (so caller state stays clean across
 * runs) and add ourselves as inheritable so `getChild()` propagates us into nested calls.
 */
export function mergeSentryCallback(existing: unknown, sentryHandler: unknown): unknown {
  if (!existing) {
    return [sentryHandler];
  }

  if (Array.isArray(existing)) {
    if (existing.includes(sentryHandler)) {
      return existing;
    }
    return [...existing, sentryHandler];
  }

  if (isCallbackManager(existing)) {
    const copied = existing.copy() as {
      addHandler: (handler: unknown, inherit?: boolean) => void;
      handlers?: unknown[];
      inheritableHandlers?: unknown[];
    };
    // CallbackManager keeps `inheritableHandlers ⊆ handlers` (both
    // `addHandler` and `setHandlers` maintain the invariant), so checking
    // `handlers` alone normally suffices — we check both as a defensive
    // guard against externally-constructed managers that bypass `addHandler`.
    const alreadyRegistered =
      (copied.handlers?.includes(sentryHandler) ?? false) ||
      (copied.inheritableHandlers?.includes(sentryHandler) ?? false);
    if (!alreadyRegistered) {
      copied.addHandler(sentryHandler, true);
    }
    return copied;
  }

  return existing;
}
