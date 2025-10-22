import type { Span } from '@opentelemetry/api';
import type { InstrumentationConfig, InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import {
  captureException,
  GEN_AI_AGENT_NAME_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
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
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  setTokenUsageAttributes,
  startSpan,
  startSpanManual,
  withActiveSpan,
} from '@sentry/core';
import type { ClaudeCodeOptions } from './index';

export type ClaudeCodeInstrumentationOptions = ClaudeCodeOptions;

const SENTRY_ORIGIN = 'auto.ai.claude-code';

/**
 * Maps Claude Code tool names to OpenTelemetry tool types.
 *
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
 * @param toolName - The name of the tool (e.g., 'Bash', 'Read', 'WebSearch')
 * @returns The OpenTelemetry tool type: 'function', 'extension', or 'datastore'
 */
function getToolType(toolName: string): 'function' | 'extension' | 'datastore' {
  // Client-side execution tools - functions that run on the client
  const functionTools = new Set([
    'Bash',
    'BashOutput',
    'KillShell', // Shell/process tools
    'Read',
    'Write',
    'Edit', // File operations
    'Glob',
    'Grep', // File search
    'Task',
    'ExitPlanMode',
    'TodoWrite', // Agent control
    'NotebookEdit',
    'SlashCommand', // Specialized operations
  ]);

  // Agent-side API calls - external service integrations
  const extensionTools = new Set(['WebSearch', 'WebFetch']);

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

    // Parse query arguments
    const [queryParams] = args as [Record<string, unknown>];
    const { options: queryOptions, inputMessages } = queryParams || {};
    const model = (queryOptions as Record<string, unknown>)?.model ?? 'unknown';

    // Create original query instance
    const originalQueryInstance = queryFunction.apply(this, args);

    // Create instrumented generator
    const instrumentedGenerator = _createInstrumentedGenerator(originalQueryInstance, model as string, {
      recordInputs,
      recordOutputs,
      inputMessages,
      agentName,
    });

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
 * Claude Code Instrumentation
 * This instrumentation is used to instrument the Claude Code SDK.
 * It is used to instrument the Claude Code SDK query function.
 */
export class SentryClaudeCodeInstrumentation extends InstrumentationBase<InstrumentationConfig> {
  public constructor(config = {}) {
    super('@sentry/instrumentation-claude-code', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      '@anthropic-ai/claude-agent-sdk',
      ['*'],
      this._patch.bind(this),
    );
    return module;
  }

  /**
   * Core patch logic applying instrumentation to the Claude Code query function.
   */
  private _patch(exports: any): any {
    const originalQuery = exports.query;

    if (typeof originalQuery !== 'function') {
      return exports;
    }

    const client = getClient();
    const integration = client?.getIntegrationByName('ClaudeCode');
    const options = (integration as any)?.options || {};

    const patchedQuery = patchClaudeCodeQuery(originalQuery, options);

    // Try direct assignment first
    try {
      exports.query = patchedQuery;
      return exports;
    } catch (_e) {
      // If direct assignment fails, try defineProperty
      try {
        Object.defineProperty(exports, 'query', {
          value: patchedQuery,
          writable: true,
          configurable: true,
          enumerable: true,
        });
        return exports;
      } catch (_error) {
        // If both fail, return a new object with the patched query
        // This handles cases where exports are frozen or non-configurable
        return { ...exports, query: patchedQuery };
      }
    }
  }
}

/**
 * Creates an instrumented async generator that wraps the original query.
 */
function _createInstrumentedGenerator(
  originalQuery: AsyncGenerator<unknown, void, unknown>,
  model: string,
  instrumentationOptions: {
    recordInputs?: boolean;
    recordOutputs?: boolean;
    inputMessages?: unknown;
    agentName?: string;
  },
): AsyncGenerator<unknown, void, unknown> {
  const agentName = instrumentationOptions.agentName ?? 'claude-code';

  return startSpanManual(
    {
      name: `invoke_agent ${agentName}`,
      op: 'gen_ai.invoke_agent',
      attributes: {
        [GEN_AI_SYSTEM_ATTRIBUTE]: agentName,
        [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: model,
        [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
        [GEN_AI_AGENT_NAME_ATTRIBUTE]: agentName,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SENTRY_ORIGIN,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
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

            if (!inputMessagesCaptured && instrumentationOptions.recordInputs && msg.conversation_history) {
              span.setAttributes({
                [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: JSON.stringify(msg.conversation_history),
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
                      [GEN_AI_SYSTEM_ATTRIBUTE]: agentName,
                      [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: model,
                      [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
                      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SENTRY_ORIGIN,
                      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
                    },
                  },
                  (childSpan: Span) => {
                    if (instrumentationOptions.recordInputs && instrumentationOptions.inputMessages) {
                      childSpan.setAttributes({
                        [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: JSON.stringify(instrumentationOptions.inputMessages),
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
                  const toolName = matchingTool!.name as string;
                  const toolType = getToolType(toolName);

                  startSpan(
                    {
                      name: `execute_tool ${toolName}`,
                      op: 'gen_ai.execute_tool',
                      attributes: {
                        [GEN_AI_SYSTEM_ATTRIBUTE]: agentName,
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
                      if (instrumentationOptions.recordInputs && matchingTool!.input) {
                        toolSpan.setAttributes({
                          [GEN_AI_TOOL_INPUT_ATTRIBUTE]: JSON.stringify(matchingTool!.input),
                        });
                      }

                      if (instrumentationOptions.recordOutputs && tr.content) {
                        toolSpan.setAttributes({
                          [GEN_AI_TOOL_OUTPUT_ATTRIBUTE]:
                            typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
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

        span.setStatus({ code: 1 });
      } catch (error) {
        // Capture exception to Sentry with proper metadata
        captureException(error, {
          mechanism: {
            type: SENTRY_ORIGIN,
            handled: false,
          },
        });

        span.setStatus({ code: 2, message: (error as Error).message });
        throw error;
      } finally {
        // Ensure all child spans are closed even if generator exits early
        if (currentLLMSpan && currentLLMSpan.isRecording()) {
          currentLLMSpan.setStatus({ code: 1 });
          currentLLMSpan.end();
        }

        if (previousLLMSpan && previousLLMSpan.isRecording()) {
          previousLLMSpan.setStatus({ code: 1 });
          previousLLMSpan.end();
        }

        span.end();
      }
    },
  );
}
