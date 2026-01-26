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

// Extension tools (external API calls) - everything else defaults to 'function'
const EXTENSION_TOOLS = new Set(['WebSearch', 'WebFetch', 'ListMcpResources', 'ReadMcpResource']);

/** Maps tool names to OpenTelemetry tool types. */
function getToolType(toolName: string): 'function' | 'extension' | 'datastore' {
  if (EXTENSION_TOOLS.has(toolName)) return 'extension';
  return 'function';
}

/** Finalizes an LLM span with response attributes and ends it. */
function finalizeLLMSpan(
  s: Span,
  c: string,
  t: unknown[],
  i: string | null,
  m: string | null,
  r: string | null,
  o: boolean,
): void {
  const a: Record<string, string> = {};
  if (o && c) a[GEN_AI_RESPONSE_TEXT_ATTRIBUTE] = c;
  if (o && t.length) a[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE] = JSON.stringify(t);
  if (i) a[GEN_AI_RESPONSE_ID_ATTRIBUTE] = i;
  if (m) a[GEN_AI_RESPONSE_MODEL_ATTRIBUTE] = m;
  if (r) a[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE] = JSON.stringify([r]);
  s.setAttributes(a);
  s.setStatus({ code: 1 });
  s.end();
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

    const [queryParams] = args as [Record<string, unknown>];
    const { options: queryOptions, prompt } = queryParams || {};
    const model = (queryOptions as Record<string, unknown>)?.model ?? 'unknown';

    const originalQueryInstance = queryFunction.apply(this, args);
    const instrumentedGenerator = _createInstrumentedGenerator(originalQueryInstance, model as string, {
      recordInputs,
      recordOutputs,
      prompt,
      agentName,
    });
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

/** Creates an instrumented async generator that wraps the original query. */
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
  const attributes: Record<string, string> = {
    [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
    [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: model,
    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
    [GEN_AI_AGENT_NAME_ATTRIBUTE]: agentName,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SENTRY_ORIGIN,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
  };

  if (instrumentationOptions.recordInputs && instrumentationOptions.prompt) {
    attributes[GEN_AI_REQUEST_MESSAGES_ATTRIBUTE] = getTruncatedJsonString(instrumentationOptions.prompt);
  }

  return startSpanManual(
    {
      name: `invoke_agent ${agentName}`,
      op: 'gen_ai.invoke_agent',
      attributes,
    },
    (span: Span) => _instrumentQueryGenerator(originalQuery, span, model, agentName, instrumentationOptions),
  );
}

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
  let sessionId: string | null = null;
  let currentLLMSpan: Span | null = null;
  let currentTurnContent = '';
  let currentTurnTools: unknown[] = [];
  let currentTurnId: string | null = null;
  let currentTurnModel: string | null = null;
  let currentTurnStopReason: string | null = null;
  let finalResult: string | null = null;
  let previousLLMSpan: Span | null = null;
  let previousTurnTools: unknown[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;
  let encounteredError = false;

  try {
    for await (const message of originalQuery) {
      const msg = message as Record<string, unknown>;

      if (msg.type === 'system') {
        if (msg.session_id) {
          sessionId = msg.session_id as string;
        }
        if (msg.subtype === 'init' && Array.isArray(msg.tools)) {
          span.setAttributes({
            [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: JSON.stringify(msg.tools),
          });
        }
      }

      if (msg.type === 'assistant') {
        if (previousLLMSpan?.isRecording()) {
          previousLLMSpan.setStatus({ code: 1 });
          previousLLMSpan.end();
        }
        previousLLMSpan = null;
        previousTurnTools = [];

        if (currentLLMSpan) {
          finalizeLLMSpan(
            currentLLMSpan,
            currentTurnContent,
            currentTurnTools,
            currentTurnId,
            currentTurnModel,
            currentTurnStopReason,
            instrumentationOptions.recordOutputs ?? false,
          );
          previousLLMSpan = currentLLMSpan;
          previousTurnTools = currentTurnTools;
        }

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
        currentTurnId = null;
        currentTurnModel = null;
        currentTurnStopReason = null;

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

        const messageUsage = (msg.message as Record<string, unknown>)?.usage as Record<string, number> | undefined;
        if (messageUsage && currentLLMSpan) {
          setTokenUsageAttributes(
            currentLLMSpan,
            messageUsage.input_tokens,
            messageUsage.output_tokens,
            messageUsage.cache_creation_input_tokens,
            messageUsage.cache_read_input_tokens,
          );
          totalInputTokens += messageUsage.input_tokens ?? 0;
          totalOutputTokens += messageUsage.output_tokens ?? 0;
          totalCacheCreationTokens += messageUsage.cache_creation_input_tokens ?? 0;
          totalCacheReadTokens += messageUsage.cache_read_input_tokens ?? 0;
        }
      }

      if (msg.type === 'result') {
        if (msg.result) {
          finalResult = msg.result as string;
        }

        if (previousLLMSpan?.isRecording()) {
          previousLLMSpan.setStatus({ code: 1 });
          previousLLMSpan.end();
        }
        previousLLMSpan = null;
        previousTurnTools = [];

        if (currentLLMSpan) {
          finalizeLLMSpan(
            currentLLMSpan,
            currentTurnContent,
            currentTurnTools,
            currentTurnId,
            currentTurnModel,
            currentTurnStopReason,
            instrumentationOptions.recordOutputs ?? false,
          );
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

                  toolSpan.setStatus(tr.is_error ? { code: 2, message: 'Tool execution error' } : { code: 1 });
                },
              );
            });
          }
        }
      }

      if (msg.type === 'error') {
        encounteredError = true;
        const errorType = (msg.error as Record<string, unknown>)?.type || 'sdk_error';
        const originalError = msg.error;
        const errorToCapture =
          originalError instanceof Error
            ? originalError
            : new Error(
                String((msg.error as Record<string, unknown>)?.message || msg.message || 'Claude Code SDK error'),
              );

        captureException(errorToCapture, {
          mechanism: {
            type: SENTRY_ORIGIN,
            handled: false,
            data: {
              function: 'query',
              errorType: String(errorType),
            },
          },
        });

        span.setStatus({ code: 2, message: errorToCapture.message });
      }

      yield message;
    }

    if (instrumentationOptions.recordOutputs && finalResult) {
      span.setAttributes({ [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: finalResult });
    }

    if (sessionId) {
      span.setAttributes({ [GEN_AI_RESPONSE_ID_ATTRIBUTE]: sessionId });
    }

    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      setTokenUsageAttributes(
        span,
        totalInputTokens,
        totalOutputTokens,
        totalCacheCreationTokens,
        totalCacheReadTokens,
      );
    }

    if (!encounteredError) {
      span.setStatus({ code: 1 });
    }
  } catch (error) {
    // Only capture if we haven't already captured this error from an error message
    if (!encounteredError) {
      captureException(error, {
        mechanism: { type: SENTRY_ORIGIN, handled: false, data: { function: 'query' } },
      });
    }
    span.setStatus({ code: 2, message: (error as Error).message });
    encounteredError = true;
    throw error;
  } finally {
    if (currentLLMSpan?.isRecording()) {
      if (encounteredError) {
        currentLLMSpan.setStatus({ code: 2, message: 'Parent operation failed' });
      } else {
        currentLLMSpan.setStatus({ code: 1 });
      }
      currentLLMSpan.end();
    }

    if (previousLLMSpan?.isRecording()) {
      if (encounteredError) {
        previousLLMSpan.setStatus({ code: 2, message: 'Parent operation failed' });
      } else {
        previousLLMSpan.setStatus({ code: 1 });
      }
      previousLLMSpan.end();
    }
    span.end();
  }
}
