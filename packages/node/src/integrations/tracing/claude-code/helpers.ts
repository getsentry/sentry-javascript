/* eslint-disable max-lines */
import type { Span } from '@opentelemetry/api';
import {
  captureException,
  GEN_AI_AGENT_NAME_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_TOOL_INPUT_ATTRIBUTE,
  GEN_AI_TOOL_NAME_ATTRIBUTE,
  GEN_AI_TOOL_OUTPUT_ATTRIBUTE,
  GEN_AI_TOOL_TYPE_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_CACHE_WRITE_ATTRIBUTE,
  getClient,
  getTruncatedJsonString,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  setTokenUsageAttributes,
  startSpan,
  startSpanManual,
  withActiveSpan,
} from '@sentry/core';
import type { ClaudeCodeOptions } from './types';

export type ClaudeCodeInstrumentationOptions = ClaudeCodeOptions;

const SENTRY_ORIGIN = 'auto.ai.claude_code';

/**
 * Maps Claude Code tool names to OpenTelemetry tool types.
 *
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript
 * @param toolName - The name of the tool (e.g., 'Bash', 'Read', 'WebSearch')
 * @returns The OpenTelemetry tool type: 'function', 'extension', or 'datastore'
 */
function getToolType(toolName: string): 'function' | 'extension' | 'datastore' {
  // Client-side execution tools - functions that run on the client
  const functionTools = new Set([
    // Shell/process tools
    'Bash',
    'BashOutput',
    'KillBash',

    // File operations
    'Read',
    'Write',
    'Edit',
    'NotebookEdit',

    // File search
    'Glob',
    'Grep',

    // Agent control
    'Task',
    'ExitPlanMode',
    'EnterPlanMode',
    'TodoWrite',

    // User interaction
    'AskUserQuestion',
    'SlashCommand',
    'Skill',
  ]);

  // Agent-side API calls - external service integrations
  const extensionTools = new Set(['WebSearch', 'WebFetch', 'ListMcpResources', 'ReadMcpResource']);

  // Data access tools - database/structured data operations
  // (Currently none in Claude Code, but future-proofing)
  const datastoreTools = new Set<string>([]);

  if (functionTools.has(toolName)) return 'function';
  if (extensionTools.has(toolName)) return 'extension';
  if (datastoreTools.has(toolName)) return 'datastore';

  // Default to function for unknown tools (safest assumption)
  return 'function';
}

/**
 * Patches the Claude Code SDK query function with Sentry instrumentation.
 * This function can be called directly to patch an imported query function.
 */
export function patchClaudeCodeQuery(
  queryFunction: (...args: unknown[]) => AsyncGenerator<unknown, void, unknown>,
  options: ClaudeCodeInstrumentationOptions = {},
): (...args: unknown[]) => AsyncGenerator<unknown, void, unknown> {
  const patchedQuery = function (this: unknown, ...args: unknown[]): AsyncGenerator<unknown, void, unknown> {
    const client = getClient();
    const defaultPii = Boolean(client?.getOptions().sendDefaultPii);

    const recordInputs = options.recordInputs ?? defaultPii;
    const recordOutputs = options.recordOutputs ?? defaultPii;
    const agentName = options.agentName ?? 'claude-code';

    // Parse query arguments - query() takes { prompt, options }
    const [queryParams] = args as [Record<string, unknown>];
    const { options: queryOptions, prompt } = queryParams || {};
    const model = (queryOptions as Record<string, unknown>)?.model ?? 'unknown';

    // Create original query instance
    const originalQueryInstance = queryFunction.apply(this, args);

    // Create instrumented generator
    const instrumentedGenerator = _createInstrumentedGenerator(originalQueryInstance, model as string, {
      recordInputs,
      recordOutputs,
      prompt,
      agentName,
    });

    // Preserve Query interface methods
    if (typeof (originalQueryInstance as Record<string, unknown>).interrupt === 'function') {
      (instrumentedGenerator as unknown as Record<string, unknown>).interrupt = (
        (originalQueryInstance as Record<string, unknown>).interrupt as (...args: unknown[]) => unknown
      ).bind(originalQueryInstance);
    }
    if (typeof (originalQueryInstance as Record<string, unknown>).setPermissionMode === 'function') {
      (instrumentedGenerator as unknown as Record<string, unknown>).setPermissionMode = (
        (originalQueryInstance as Record<string, unknown>).setPermissionMode as (...args: unknown[]) => unknown
      ).bind(originalQueryInstance);
    }

    return instrumentedGenerator;
  };

  return patchedQuery as typeof queryFunction;
}

/**
 * Creates an instrumented async generator that wraps the original query.
 * This follows the pattern used by OpenAI and Anthropic integrations:
 * - startSpanManual creates the span and returns the instrumented generator
 * - The span is passed to the generator and ended in its finally block
 */
function _createInstrumentedGenerator(
  originalQuery: AsyncGenerator<unknown, void, unknown>,
  model: string,
  instrumentationOptions: {
    recordInputs?: boolean;
    recordOutputs?: boolean;
    prompt?: unknown;
    agentName?: string;
  },
): AsyncGenerator<unknown, void, unknown> {
  const agentName = instrumentationOptions.agentName ?? 'claude-code';

  return startSpanManual(
    {
      name: `invoke_agent ${agentName}`,
      op: 'gen_ai.invoke_agent',
      attributes: {
        [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
        [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: model,
        [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
        [GEN_AI_AGENT_NAME_ATTRIBUTE]: agentName,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SENTRY_ORIGIN,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
      },
    },
    (span: Span) => {
      // Return the instrumented generator - span.end() is called in the generator's finally block
      return _instrumentQueryGenerator(originalQuery, span, model, agentName, instrumentationOptions);
    },
  );
}

/**
 * Instruments the query async generator with span tracking.
 * The span is ended in the finally block to ensure proper cleanup.
 */
// eslint-disable-next-line complexity
async function* _instrumentQueryGenerator(
  originalQuery: AsyncGenerator<unknown, void, unknown>,
  span: Span,
  model: string,
  agentName: string,
  instrumentationOptions: {
    recordInputs?: boolean;
    recordOutputs?: boolean;
    prompt?: unknown;
    agentName?: string;
  },
): AsyncGenerator<unknown, void, unknown> {
  // State accumulation
  let sessionId: string | null = null;
  let currentLLMSpan: Span | null = null;
  let currentTurnContent = '';
  let currentTurnTools: unknown[] = [];
  let currentTurnId: string | null = null;
  let currentTurnModel: string | null = null;
  let currentTurnStopReason: string | null = null;
  let inputMessagesCaptured = false;
  let finalResult: string | null = null;
  let previousLLMSpan: Span | null = null;
  let previousTurnTools: unknown[] = [];

  // Accumulative token usage for invoke_agent span
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;

  try {
    for await (const message of originalQuery) {
      const msg = message as Record<string, unknown>;

      // Extract session ID and available tools from system message
      if (msg.type === 'system') {
        if (msg.session_id) {
          sessionId = msg.session_id as string;
        }

        // Capture available tools from system init message
        if (msg.subtype === 'init' && Array.isArray(msg.tools)) {
          span.setAttributes({
            [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: JSON.stringify(msg.tools),
          });
        }

        if (!inputMessagesCaptured && instrumentationOptions.recordInputs && msg.conversation_history) {
          span.setAttributes({
            [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: getTruncatedJsonString(msg.conversation_history),
          });
          inputMessagesCaptured = true;
        }
      }

      // Handle assistant messages
      if (msg.type === 'assistant') {
        // Close previous LLM span if still open
        if (previousLLMSpan) {
          previousLLMSpan.setStatus({ code: 1 });
          previousLLMSpan.end();
          previousLLMSpan = null;
          previousTurnTools = [];
        }

        // Create new LLM span
        if (!currentLLMSpan) {
          currentLLMSpan = withActiveSpan(span, () => {
            return startSpanManual(
              {
                name: `chat ${model}`,
                op: 'gen_ai.chat',
                attributes: {
                  [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
                  [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: model,
                  [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SENTRY_ORIGIN,
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
                },
              },
              (childSpan: Span) => {
                if (instrumentationOptions.recordInputs && instrumentationOptions.prompt) {
                  childSpan.setAttributes({
                    [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: getTruncatedJsonString(instrumentationOptions.prompt),
                  });
                }
                return childSpan;
              },
            );
          });

          currentTurnContent = '';
          currentTurnTools = [];
        }

        // Accumulate content
        const content = (msg.message as Record<string, unknown>)?.content as unknown[];
        if (Array.isArray(content)) {
          const textContent = content
            .filter(c => (c as Record<string, unknown>).type === 'text')
            .map(c => (c as Record<string, unknown>).text as string)
            .join('');
          if (textContent) {
            currentTurnContent += textContent;
          }

          const tools = content.filter(c => (c as Record<string, unknown>).type === 'tool_use');
          if (tools.length > 0) {
            currentTurnTools.push(...tools);
          }
        }

        if ((msg.message as Record<string, unknown>)?.id) {
          currentTurnId = (msg.message as Record<string, unknown>).id as string;
        }
        if ((msg.message as Record<string, unknown>)?.model) {
          currentTurnModel = (msg.message as Record<string, unknown>).model as string;
        }
        if ((msg.message as Record<string, unknown>)?.stop_reason) {
          currentTurnStopReason = (msg.message as Record<string, unknown>).stop_reason as string;
        }
      }

      // Handle result messages
      if (msg.type === 'result') {
        if (msg.result) {
          finalResult = msg.result as string;
        }

        // Close previous LLM span
        if (previousLLMSpan) {
          previousLLMSpan.setStatus({ code: 1 });
          previousLLMSpan.end();
          previousLLMSpan = null;
          previousTurnTools = [];
        }

        // Finalize current LLM span
        if (currentLLMSpan) {
          if (instrumentationOptions.recordOutputs && currentTurnContent) {
            currentLLMSpan.setAttributes({
              [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: currentTurnContent,
            });
          }

          if (instrumentationOptions.recordOutputs && currentTurnTools.length > 0) {
            currentLLMSpan.setAttributes({
              [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: JSON.stringify(currentTurnTools),
            });
          }

          if (currentTurnId) {
            currentLLMSpan.setAttributes({
              [GEN_AI_RESPONSE_ID_ATTRIBUTE]: currentTurnId,
            });
          }
          if (currentTurnModel) {
            currentLLMSpan.setAttributes({
              [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: currentTurnModel,
            });
          }
          if (currentTurnStopReason) {
            currentLLMSpan.setAttributes({
              [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: JSON.stringify([currentTurnStopReason]),
            });
          }

          if (msg.usage) {
            const usage = msg.usage as Record<string, number>;
            setTokenUsageAttributes(
              currentLLMSpan,
              usage.input_tokens,
              usage.output_tokens,
              usage.cache_creation_input_tokens,
              usage.cache_read_input_tokens,
            );

            // Set additional cache token attributes
            if (usage.cache_creation_input_tokens !== undefined) {
              currentLLMSpan.setAttributes({
                [GEN_AI_USAGE_INPUT_TOKENS_CACHE_WRITE_ATTRIBUTE]: usage.cache_creation_input_tokens,
              });
            }
            if (usage.cache_read_input_tokens !== undefined) {
              currentLLMSpan.setAttributes({
                [GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE]: usage.cache_read_input_tokens,
              });
            }

            // Accumulate tokens for the invoke_agent span
            totalInputTokens += usage.input_tokens ?? 0;
            totalOutputTokens += usage.output_tokens ?? 0;
            totalCacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
            totalCacheReadTokens += usage.cache_read_input_tokens ?? 0;
          }

          currentLLMSpan.setStatus({ code: 1 });
          currentLLMSpan.end();

          previousLLMSpan = currentLLMSpan;
          previousTurnTools = currentTurnTools;

          currentLLMSpan = null;
          currentTurnContent = '';
          currentTurnTools = [];
          currentTurnId = null;
          currentTurnModel = null;
          currentTurnStopReason = null;
        }
      }

      // Handle tool results
      if (msg.type === 'user' && (msg.message as Record<string, unknown>)?.content) {
        const content = (msg.message as Record<string, unknown>).content as unknown[];
        const toolResults = Array.isArray(content)
          ? content.filter(c => (c as Record<string, unknown>).type === 'tool_result')
          : [];

        for (const toolResult of toolResults) {
          const tr = toolResult as Record<string, unknown>;
          let matchingTool = currentTurnTools.find(t => (t as Record<string, unknown>).id === tr.tool_use_id) as
            | Record<string, unknown>
            | undefined;
          let parentLLMSpan = currentLLMSpan;

          if (!matchingTool && previousTurnTools.length > 0) {
            matchingTool = previousTurnTools.find(t => (t as Record<string, unknown>).id === tr.tool_use_id) as
              | Record<string, unknown>
              | undefined;
            parentLLMSpan = previousLLMSpan;
          }

          if (matchingTool && parentLLMSpan) {
            withActiveSpan(parentLLMSpan, () => {
              const toolName = matchingTool.name as string;
              const toolType = getToolType(toolName);

              startSpan(
                {
                  name: `execute_tool ${toolName}`,
                  op: 'gen_ai.execute_tool',
                  attributes: {
                    [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
                    [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: model,
                    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'execute_tool',
                    [GEN_AI_AGENT_NAME_ATTRIBUTE]: agentName,
                    [GEN_AI_TOOL_NAME_ATTRIBUTE]: toolName,
                    [GEN_AI_TOOL_TYPE_ATTRIBUTE]: toolType,
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SENTRY_ORIGIN,
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.execute_tool',
                  },
                },
                (toolSpan: Span) => {
                  if (instrumentationOptions.recordInputs && matchingTool.input) {
                    toolSpan.setAttributes({
                      [GEN_AI_TOOL_INPUT_ATTRIBUTE]: getTruncatedJsonString(matchingTool.input),
                    });
                  }

                  if (instrumentationOptions.recordOutputs && tr.content) {
                    toolSpan.setAttributes({
                      [GEN_AI_TOOL_OUTPUT_ATTRIBUTE]:
                        typeof tr.content === 'string' ? tr.content : getTruncatedJsonString(tr.content),
                    });
                  }

                  // Set span status explicitly
                  if (tr.is_error) {
                    toolSpan.setStatus({ code: 2, message: 'Tool execution error' });
                  } else {
                    toolSpan.setStatus({ code: 1 }); // Explicit success status
                  }
                },
              );
            });
          }
        }
      }

      yield message;
    }

    if (instrumentationOptions.recordOutputs && finalResult) {
      span.setAttributes({
        [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: finalResult,
      });
    }

    if (sessionId) {
      span.setAttributes({
        [GEN_AI_RESPONSE_ID_ATTRIBUTE]: sessionId,
      });
    }

    // Set accumulative token usage on the invoke_agent span
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      setTokenUsageAttributes(
        span,
        totalInputTokens,
        totalOutputTokens,
        totalCacheCreationTokens,
        totalCacheReadTokens,
      );

      if (totalCacheCreationTokens > 0) {
        span.setAttributes({
          [GEN_AI_USAGE_INPUT_TOKENS_CACHE_WRITE_ATTRIBUTE]: totalCacheCreationTokens,
        });
      }
      if (totalCacheReadTokens > 0) {
        span.setAttributes({
          [GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE]: totalCacheReadTokens,
        });
      }
    }

    span.setStatus({ code: 1 });
  } catch (error) {
    // Capture exception to Sentry with proper metadata
    captureException(error, {
      mechanism: {
        type: SENTRY_ORIGIN,
        handled: false,
        data: {
          function: 'query',
        },
      },
    });

    span.setStatus({ code: 2, message: (error as Error).message });
    throw error;
  } finally {
    // Ensure all child spans are closed even if generator exits early
    if (currentLLMSpan?.isRecording()) {
      currentLLMSpan.setStatus({ code: 1 });
      currentLLMSpan.end();
    }

    if (previousLLMSpan?.isRecording()) {
      previousLLMSpan.setStatus({ code: 1 });
      previousLLMSpan.end();
    }

    // End the parent span in the finally block
    span.end();
  }
}
