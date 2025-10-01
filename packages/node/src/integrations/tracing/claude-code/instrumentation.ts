import type { Span } from '@opentelemetry/api';
import { getClient, startSpanManual, withActiveSpan, startSpan } from '@sentry/core';
import type { ClaudeCodeOptions } from './index';

type ClaudeCodeInstrumentationOptions = ClaudeCodeOptions;

const GEN_AI_ATTRIBUTES = {
  SYSTEM: 'gen_ai.system',
  OPERATION_NAME: 'gen_ai.operation.name',
  REQUEST_MODEL: 'gen_ai.request.model',
  REQUEST_MESSAGES: 'gen_ai.request.messages',
  RESPONSE_TEXT: 'gen_ai.response.text',
  RESPONSE_TOOL_CALLS: 'gen_ai.response.tool_calls',
  RESPONSE_ID: 'gen_ai.response.id',
  RESPONSE_MODEL: 'gen_ai.response.model',
  USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  USAGE_TOTAL_TOKENS: 'gen_ai.usage.total_tokens',
  TOOL_NAME: 'gen_ai.tool.name',
  TOOL_INPUT: 'gen_ai.tool.input',
  TOOL_OUTPUT: 'gen_ai.tool.output',
  AGENT_NAME: 'gen_ai.agent.name',
} as const;

const SENTRY_ORIGIN = 'auto.ai.claude-code';

function setTokenUsageAttributes(
  span: Span,
  inputTokens?: number,
  outputTokens?: number,
  cacheCreationTokens?: number,
  cacheReadTokens?: number,
): void {
  const attrs: Record<string, number> = {};

  if (typeof inputTokens === 'number') {
    attrs[GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS] = inputTokens;
  }
  if (typeof outputTokens === 'number') {
    attrs[GEN_AI_ATTRIBUTES.USAGE_OUTPUT_TOKENS] = outputTokens;
  }

  const total = (inputTokens ?? 0) + (outputTokens ?? 0) + (cacheCreationTokens ?? 0) + (cacheReadTokens ?? 0);
  if (total > 0) {
    attrs[GEN_AI_ATTRIBUTES.USAGE_TOTAL_TOKENS] = total;
  }

  if (Object.keys(attrs).length > 0) {
    span.setAttributes(attrs);
  }
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

    // Parse query arguments
    const [queryParams] = args as [Record<string, unknown>];
    const { options: queryOptions, inputMessages } = queryParams || {};
    const model = (queryOptions as Record<string, unknown>)?.model ?? 'sonnet';

    // Create original query instance
    const originalQueryInstance = queryFunction.apply(this, args);

    // Create instrumented generator
    const instrumentedGenerator = _createInstrumentedGenerator(
      originalQueryInstance,
      model as string,
      { recordInputs, recordOutputs, inputMessages },
    );

    // Preserve Query interface methods
    if (typeof (originalQueryInstance as Record<string, unknown>).interrupt === 'function') {
      (instrumentedGenerator as unknown as Record<string, unknown>).interrupt = (
        (originalQueryInstance as Record<string, unknown>).interrupt as Function
      ).bind(originalQueryInstance);
    }
    if (typeof (originalQueryInstance as Record<string, unknown>).setPermissionMode === 'function') {
      (instrumentedGenerator as unknown as Record<string, unknown>).setPermissionMode = (
        (originalQueryInstance as Record<string, unknown>).setPermissionMode as Function
      ).bind(originalQueryInstance);
    }

    return instrumentedGenerator;
  };

  return patchedQuery as typeof queryFunction;
}

/**
 * Creates an instrumented async generator that wraps the original query.
 */
function _createInstrumentedGenerator(
  originalQuery: AsyncGenerator<unknown, void, unknown>,
  model: string,
  instrumentationOptions: { recordInputs?: boolean; recordOutputs?: boolean; inputMessages?: unknown },
): AsyncGenerator<unknown, void, unknown> {
    return startSpanManual(
      {
        name: `invoke_agent claude-code`,
        op: 'gen_ai.invoke_agent',
        attributes: {
          [GEN_AI_ATTRIBUTES.SYSTEM]: 'claude-code',
          [GEN_AI_ATTRIBUTES.REQUEST_MODEL]: model,
          [GEN_AI_ATTRIBUTES.OPERATION_NAME]: 'invoke_agent',
          [GEN_AI_ATTRIBUTES.AGENT_NAME]: 'claude-code',
          'sentry.origin': SENTRY_ORIGIN,
        },
      },
      async function* (span: Span) {
        // State accumulation
        let sessionId: string | null = null;
        let currentLLMSpan: Span | null = null;
        let currentTurnContent = '';
        let currentTurnTools: unknown[] = [];
        let currentTurnId: string | null = null;
        let currentTurnModel: string | null = null;
        let inputMessagesCaptured = false;
        let finalResult: string | null = null;
        let previousLLMSpan: Span | null = null;
        let previousTurnTools: unknown[] = [];

        try {
          for await (const message of originalQuery) {
            const msg = message as Record<string, unknown>;

            // Extract session ID from system message
            if (msg.type === 'system' && msg.session_id) {
              sessionId = msg.session_id as string;

              if (
                !inputMessagesCaptured &&
                instrumentationOptions.recordInputs &&
                msg.conversation_history
              ) {
                span.setAttributes({
                  [GEN_AI_ATTRIBUTES.REQUEST_MESSAGES]: JSON.stringify(msg.conversation_history),
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
                        [GEN_AI_ATTRIBUTES.SYSTEM]: 'claude-code',
                        [GEN_AI_ATTRIBUTES.REQUEST_MODEL]: model,
                        [GEN_AI_ATTRIBUTES.OPERATION_NAME]: 'chat',
                        'sentry.origin': SENTRY_ORIGIN,
                      },
                    },
                    (childSpan: Span) => {
                      if (instrumentationOptions.recordInputs && instrumentationOptions.inputMessages) {
                        childSpan.setAttributes({
                          [GEN_AI_ATTRIBUTES.REQUEST_MESSAGES]: JSON.stringify(
                            instrumentationOptions.inputMessages,
                          ),
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
                  .filter((c) => (c as Record<string, unknown>).type === 'text')
                  .map((c) => (c as Record<string, unknown>).text as string)
                  .join('');
                if (textContent) {
                  currentTurnContent += textContent;
                }

                const tools = content.filter((c) => (c as Record<string, unknown>).type === 'tool_use');
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
                    [GEN_AI_ATTRIBUTES.RESPONSE_TEXT]: currentTurnContent,
                  });
                }

                if (instrumentationOptions.recordOutputs && currentTurnTools.length > 0) {
                  currentLLMSpan.setAttributes({
                    [GEN_AI_ATTRIBUTES.RESPONSE_TOOL_CALLS]: JSON.stringify(currentTurnTools),
                  });
                }

                if (currentTurnId) {
                  currentLLMSpan.setAttributes({
                    [GEN_AI_ATTRIBUTES.RESPONSE_ID]: currentTurnId,
                  });
                }
                if (currentTurnModel) {
                  currentLLMSpan.setAttributes({
                    [GEN_AI_ATTRIBUTES.RESPONSE_MODEL]: currentTurnModel,
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
              }
            }

            // Handle tool results
            if (msg.type === 'user' && (msg.message as Record<string, unknown>)?.content) {
              const content = (msg.message as Record<string, unknown>).content as unknown[];
              const toolResults = Array.isArray(content)
                ? content.filter((c) => (c as Record<string, unknown>).type === 'tool_result')
                : [];

              for (const toolResult of toolResults) {
                const tr = toolResult as Record<string, unknown>;
                let matchingTool = currentTurnTools.find(
                  (t) => (t as Record<string, unknown>).id === tr.tool_use_id,
                ) as Record<string, unknown> | undefined;
                let parentLLMSpan = currentLLMSpan;

                if (!matchingTool && previousTurnTools.length > 0) {
                  matchingTool = previousTurnTools.find(
                    (t) => (t as Record<string, unknown>).id === tr.tool_use_id,
                  ) as Record<string, unknown> | undefined;
                  parentLLMSpan = previousLLMSpan;
                }

                if (matchingTool && parentLLMSpan) {
                  withActiveSpan(parentLLMSpan, () => {
                    startSpan(
                      {
                        name: `execute_tool ${matchingTool!.name as string}`,
                        op: 'gen_ai.execute_tool',
                        attributes: {
                          [GEN_AI_ATTRIBUTES.SYSTEM]: 'claude-code',
                          [GEN_AI_ATTRIBUTES.REQUEST_MODEL]: model,
                          [GEN_AI_ATTRIBUTES.OPERATION_NAME]: 'execute_tool',
                          [GEN_AI_ATTRIBUTES.AGENT_NAME]: 'claude-code',
                          [GEN_AI_ATTRIBUTES.TOOL_NAME]: matchingTool!.name as string,
                          'sentry.origin': SENTRY_ORIGIN,
                        },
                      },
                      (toolSpan: Span) => {
                        if (instrumentationOptions.recordInputs && matchingTool!.input) {
                          toolSpan.setAttributes({
                            [GEN_AI_ATTRIBUTES.TOOL_INPUT]: JSON.stringify(matchingTool!.input),
                          });
                        }

                        if (instrumentationOptions.recordOutputs && tr.content) {
                          toolSpan.setAttributes({
                            [GEN_AI_ATTRIBUTES.TOOL_OUTPUT]:
                              typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
                          });
                        }

                        if (tr.is_error) {
                          toolSpan.setStatus({ code: 2, message: 'Tool execution error' });
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
              [GEN_AI_ATTRIBUTES.RESPONSE_TEXT]: finalResult,
            });
          }

          if (sessionId) {
            span.setAttributes({
              [GEN_AI_ATTRIBUTES.RESPONSE_ID]: sessionId,
            });
          }

          span.setStatus({ code: 1 });
        } catch (error) {
          span.setStatus({ code: 2, message: (error as Error).message });
          throw error;
        } finally {
          span.end();
        }
      },
    );
}
