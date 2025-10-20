import type { Span } from '@opentelemetry/api';
import {
  captureException,
  GEN_AI_AGENT_NAME_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_TOOL_INPUT_ATTRIBUTE,
  GEN_AI_TOOL_NAME_ATTRIBUTE,
  GEN_AI_TOOL_OUTPUT_ATTRIBUTE,
  GEN_AI_TOOL_TYPE_ATTRIBUTE,
  getClient,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  setTokenUsageAttributes,
  startSpan,
  startSpanManual,
  withActiveSpan,
} from '@sentry/core';
import type {
  Codex,
  CodexOptions,
  ItemCompletedEvent,
  ItemStartedEvent,
  OpenAiCodexOptions,
  StreamedTurn,
  Thread,
  ThreadEvent,
  ThreadItem,
  Turn,
  TurnOptions,
} from './types';

const SENTRY_ORIGIN = 'auto.ai.openai-codex';
const CODEX_MODEL_NAME = 'gpt-5-codex';

/**
 * Maps Codex tool/item types to OpenTelemetry tool types.
 *
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
 * @param itemType - The type of the item (e.g., 'command_execution', 'web_search', 'mcp_tool_call')
 * @returns The OpenTelemetry tool type: 'function', 'extension', or 'datastore'
 */
function getToolType(itemType: string): 'function' | 'extension' | 'datastore' {
  // Client-side execution tools - functions that run on the client
  const functionTools = new Set([
    'command_execution', // Shell/process tools
    'file_change', // File operations
    'reasoning', // Agent reasoning
    'agent_message', // Agent messages
    'todo_list', // Task management
  ]);

  // Agent-side API calls - external service integrations
  const extensionTools = new Set(['web_search', 'mcp_tool_call']);

  // Data access tools - database/structured data operations
  const datastoreTools = new Set<string>([]);

  if (functionTools.has(itemType)) return 'function';
  if (extensionTools.has(itemType)) return 'extension';
  if (datastoreTools.has(itemType)) return 'datastore';

  // Default to function for unknown tools (safest assumption)
  return 'function';
}

/**
 * Get a display name for a thread item based on its type and properties
 */
function getItemDisplayName(item: ThreadItem): string {
  switch (item.type) {
    case 'command_execution':
      // Use just the item type, not the full command (which can be very long)
      return 'command_execution';
    case 'web_search':
      return 'web_search';
    case 'mcp_tool_call':
      return `mcp_tool_call.${item.server}.${item.tool}`;
    case 'file_change':
      return 'file_change';
    case 'agent_message':
      return 'agent_message';
    case 'reasoning':
      return 'reasoning';
    case 'todo_list':
      return 'todo_list';
    case 'error':
      return 'error';
    default:
      // TypeScript exhaustiveness check
      return (item as ThreadItem).type;
  }
}

/**
 * Get a descriptive span name for a thread item
 * Format: "execute_tool <type>"
 * Details go into the input/output attributes
 */
function getSpanDescription(item: ThreadItem): string {
  switch (item.type) {
    case 'command_execution':
      return 'execute_tool command_execution';
    case 'web_search':
      return 'execute_tool web_search';
    case 'mcp_tool_call':
      return 'execute_tool mcp_tool_call';
    case 'file_change':
      return 'execute_tool file_change';
    case 'agent_message':
      return 'execute_tool agent_message';
    case 'reasoning':
      return 'execute_tool reasoning';
    case 'todo_list':
      return 'execute_tool todo_list';
    case 'error':
      return 'execute_tool error';
    default:
      return `execute_tool ${(item as ThreadItem).type}`;
  }
}

/**
 * Get input data for a thread item for telemetry
 */
function getItemInput(item: ThreadItem): string | undefined {
  switch (item.type) {
    case 'command_execution':
      return item.command;
    case 'web_search':
      return item.query;
    case 'mcp_tool_call':
      return JSON.stringify({ server: item.server, tool: item.tool });
    case 'file_change':
      return JSON.stringify(item.changes);
    case 'agent_message':
      return item.text;
    case 'reasoning':
      return item.text;
    case 'todo_list':
      return JSON.stringify(item.items);
    default:
      return undefined;
  }
}

/**
 * Strip ANSI escape codes from terminal output
 * Common codes like \x1B(B\x1B[m are used for text formatting/color
 */
function stripAnsiCodes(text: string): string {
  // Remove all ANSI escape sequences including:
  // - \x1B[...m (SGR - colors, styles)
  // - \x1B(B (character set selection)
  // - Other control sequences
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:\[[0-9;]*[a-zA-Z]|\([AB012]|[@-Z\\-_])/g, '');
}

/**
 * Get output data for a thread item for telemetry
 */
function getItemOutput(item: ThreadItem): string | undefined {
  switch (item.type) {
    case 'command_execution': {
      // Strip ANSI codes from terminal output
      const cleanOutput = stripAnsiCodes(item.aggregated_output);
      const exitCodeStr = `Exit code: ${item.exit_code ?? 'N/A'}`;
      // Only include output if it's not empty after stripping ANSI codes
      return cleanOutput.trim() ? `${cleanOutput}\n${exitCodeStr}` : exitCodeStr;
    }
    case 'file_change':
      return `Status: ${item.status}`;
    case 'mcp_tool_call':
      return `Status: ${item.status}`;
    case 'error':
      return item.message;
    default:
      return undefined;
  }
}

/**
 * Wraps a Thread instance to add Sentry instrumentation
 */
function instrumentThread(
  originalThread: Thread,
  agentName: string,
  recordInputs: boolean,
  recordOutputs: boolean,
): Thread {
  // Wrap the runStreamed method
  const originalRunStreamed = originalThread.runStreamed.bind(originalThread);
  originalThread.runStreamed = async function (input: string, turnOptions?: TurnOptions): Promise<StreamedTurn> {
    const originalStreamedTurn = await originalRunStreamed(input, turnOptions);

    return {
      events: instrumentStreamedTurn(originalStreamedTurn.events, input, agentName, recordInputs, recordOutputs),
    };
  };

  // Wrap the run method
  const originalRun = originalThread.run.bind(originalThread);
  originalThread.run = async function (input: string, turnOptions?: TurnOptions): Promise<Turn> {
    return instrumentNonStreamedTurn(originalRun, input, turnOptions, agentName, recordInputs, recordOutputs);
  };

  return originalThread;
}

/**
 * Instruments a streamed turn (runStreamed) with Sentry spans
 */
async function* instrumentStreamedTurn(
  originalStream: AsyncGenerator<ThreadEvent>,
  input: string,
  agentName: string,
  recordInputs: boolean,
  recordOutputs: boolean,
): AsyncGenerator<ThreadEvent, void, unknown> {
  yield* startSpanManual(
    {
      name: `invoke_agent ${agentName}`,
      op: 'gen_ai.invoke_agent',
      attributes: {
        [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai-codex',
        [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: CODEX_MODEL_NAME,
        [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
        [GEN_AI_AGENT_NAME_ATTRIBUTE]: agentName,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SENTRY_ORIGIN,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
        ...(recordInputs && {
          [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: JSON.stringify([{ role: 'user', content: input }]),
        }),
      },
    },
    // eslint-disable-next-line complexity -- Complex event handling for streaming AI responses
    async function* (agentSpan: Span) {
        let threadId: string | null = null;
        let currentTurnSpan: Span | null = null;
        const itemSpans = new Map<string, Span>();
        let turnMessages: string[] = [];

        try {
          for await (const event of originalStream) {
            // Capture thread ID
            if (event.type === 'thread.started') {
              threadId = event.thread_id;
              agentSpan.setAttributes({
                [GEN_AI_RESPONSE_ID_ATTRIBUTE]: threadId,
              });
            }

            // Start turn span
            if (event.type === 'turn.started') {
              if (currentTurnSpan) {
                currentTurnSpan.setStatus({ code: 1 });
                currentTurnSpan.end();
              }

              currentTurnSpan = withActiveSpan(agentSpan, () => {
                return startSpanManual(
                  {
                    name: `chat ${CODEX_MODEL_NAME}`,
                    op: 'gen_ai.chat',
                    attributes: {
                      [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai-codex',
                      [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: CODEX_MODEL_NAME,
                      [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
                      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SENTRY_ORIGIN,
                      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
                      ...(recordInputs && {
                        [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: JSON.stringify([{ role: 'user', content: input }]),
                      }),
                    },
                  },
                  (span: Span) => span,
                );
              });

              turnMessages = [];
            }

            // Complete turn span
            if (event.type === 'turn.completed') {
              const turnCompletedEvent = event;
              if (currentTurnSpan) {
                // Add response text if we captured any messages
                if (recordOutputs && turnMessages.length > 0) {
                  currentTurnSpan.setAttributes({
                    [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: turnMessages.join('\n'),
                  });
                }

                // Add token usage
                if (turnCompletedEvent.usage) {
                  setTokenUsageAttributes(
                    currentTurnSpan,
                    turnCompletedEvent.usage.input_tokens,
                    turnCompletedEvent.usage.output_tokens,
                    turnCompletedEvent.usage.cached_input_tokens,
                    0,
                  );
                }

                currentTurnSpan.setStatus({ code: 1 });
                currentTurnSpan.end();
                currentTurnSpan = null;
              }
            }

            // Handle turn failure
            if (event.type === 'turn.failed') {
              const turnFailedEvent = event;
              if (currentTurnSpan) {
                currentTurnSpan.setStatus({ code: 2, message: turnFailedEvent.error.message });
                currentTurnSpan.end();
                currentTurnSpan = null;
              }
            }

            // Start item span - only for items that have a completion state
            if (event.type === 'item.started') {
              const itemEvent = event;
              const item = itemEvent.item;

              // Only create spans for items that will have meaningful execution
              // Skip reasoning items as they complete immediately
              if (currentTurnSpan && item.type !== 'reasoning' && item.type !== 'agent_message') {
                const itemSpan = withActiveSpan(currentTurnSpan, () => {
                  const itemName = getItemDisplayName(item);
                  const toolType = getToolType(item.type);
                  const spanDescription = getSpanDescription(item);

                  return startSpanManual(
                    {
                      name: spanDescription,
                      op: 'gen_ai.execute_tool',
                      attributes: {
                        [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai-codex',
                        [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: CODEX_MODEL_NAME,
                        [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'execute_tool',
                        [GEN_AI_AGENT_NAME_ATTRIBUTE]: agentName,
                        [GEN_AI_TOOL_NAME_ATTRIBUTE]: itemName,
                        [GEN_AI_TOOL_TYPE_ATTRIBUTE]: toolType,
                        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SENTRY_ORIGIN,
                        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.execute_tool',
                      },
                    },
                    (span: Span) => {
                      if (recordInputs) {
                        const itemInput = getItemInput(item);
                        if (itemInput) {
                          span.setAttributes({
                            [GEN_AI_TOOL_INPUT_ATTRIBUTE]: itemInput,
                          });
                        }
                      }
                      return span;
                    },
                  );
                });

                itemSpans.set(item.id, itemSpan);
              }
            }

            // Complete item span
            if (event.type === 'item.completed') {
              const itemEvent = event;
              const item = itemEvent.item;

              // For items with spans (command_execution, web_search, etc.)
              const itemSpan = itemSpans.get(item.id);
              if (itemSpan) {
                // Update input with latest data (may have been updated since item.started)
                if (recordInputs) {
                  const itemInput = getItemInput(item);
                  if (itemInput) {
                    itemSpan.setAttributes({
                      [GEN_AI_TOOL_INPUT_ATTRIBUTE]: itemInput,
                    });
                  }
                }

                if (recordOutputs) {
                  const itemOutput = getItemOutput(item);
                  if (itemOutput) {
                    itemSpan.setAttributes({
                      [GEN_AI_TOOL_OUTPUT_ATTRIBUTE]: itemOutput,
                    });
                  }
                }

                // Check for error status - handle command execution exit codes
                if (item.type === 'error') {
                  itemSpan.setStatus({ code: 2, message: item.message });
                } else if (item.type === 'command_execution') {
                  // Check exit code - exit_code is optional and may be undefined while in progress
                  if (typeof item.exit_code === 'number' && item.exit_code !== 0) {
                    itemSpan.setStatus({ code: 2, message: `Command failed with exit code ${item.exit_code}` });
                  } else if (item.status === 'failed') {
                    itemSpan.setStatus({ code: 2, message: 'Command execution failed' });
                  } else {
                    itemSpan.setStatus({ code: 1 });
                  }
                } else if ('status' in item && item.status === 'failed') {
                  itemSpan.setStatus({ code: 2, message: 'Tool execution failed' });
                } else {
                  itemSpan.setStatus({ code: 1 });
                }

                itemSpan.end();
                itemSpans.delete(item.id);
              }

              // Capture agent messages for response text
              if (item.type === 'agent_message') {
                turnMessages.push(item.text);
              }
            }

            yield event;
          }

          agentSpan.setStatus({ code: 1 });
        } catch (error) {
          captureException(error, {
            mechanism: {
              type: SENTRY_ORIGIN,
              handled: false,
            },
          });

          agentSpan.setStatus({ code: 2, message: (error as Error).message });
          throw error;
        } finally {
          // Clean up any remaining spans
          if (currentTurnSpan && currentTurnSpan.isRecording()) {
            currentTurnSpan.setStatus({ code: 1 });
            currentTurnSpan.end();
          }

          for (const itemSpan of itemSpans.values()) {
            if (itemSpan.isRecording()) {
              itemSpan.setStatus({ code: 1 });
              itemSpan.end();
            }
          }

          agentSpan.end();
        }
      },
    );
}

/**
 * Instruments a non-streamed turn (run) with Sentry spans
 */
async function instrumentNonStreamedTurn(
  originalRun: (input: string, turnOptions?: TurnOptions) => Promise<Turn>,
  input: string,
  turnOptions: TurnOptions | undefined,
  agentName: string,
  recordInputs: boolean,
  recordOutputs: boolean,
): Promise<Turn> {
  return startSpanManual(
    {
      name: `invoke_agent ${agentName}`,
      op: 'gen_ai.invoke_agent',
      attributes: {
        [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai-codex',
        [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: CODEX_MODEL_NAME,
        [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
        [GEN_AI_AGENT_NAME_ATTRIBUTE]: agentName,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SENTRY_ORIGIN,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
        ...(recordInputs && {
          [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: JSON.stringify([{ role: 'user', content: input }]),
        }),
      },
    },
    async (agentSpan: Span) => {
        try {
          const result = await withActiveSpan(agentSpan, async () => {
            return await startSpanManual(
              {
                name: `chat ${CODEX_MODEL_NAME}`,
                op: 'gen_ai.chat',
                attributes: {
                  [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai-codex',
                  [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: CODEX_MODEL_NAME,
                  [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SENTRY_ORIGIN,
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
                  ...(recordInputs && {
                    [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: JSON.stringify([{ role: 'user', content: input }]),
                  }),
                },
              },
              async (chatSpan: Span) => {
                const turn = await originalRun(input, turnOptions);

                // Add response text
                if (recordOutputs && turn.finalResponse) {
                  chatSpan.setAttributes({
                    [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: turn.finalResponse,
                  });
                }

                // Note: run() doesn't provide usage information, only runStreamed() does via events

                // Create spans for each item
                for (const item of turn.items) {
                  await withActiveSpan(chatSpan, () => {
                    const itemName = getItemDisplayName(item);
                    const toolType = getToolType(item.type);
                    const spanDescription = getSpanDescription(item);

                    startSpan(
                      {
                        name: spanDescription,
                        op: 'gen_ai.execute_tool',
                        attributes: {
                          [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai-codex',
                          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: CODEX_MODEL_NAME,
                          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'execute_tool',
                          [GEN_AI_AGENT_NAME_ATTRIBUTE]: agentName,
                          [GEN_AI_TOOL_NAME_ATTRIBUTE]: itemName,
                          [GEN_AI_TOOL_TYPE_ATTRIBUTE]: toolType,
                          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SENTRY_ORIGIN,
                          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.execute_tool',
                        },
                      },
                      (itemSpan: Span) => {
                        if (recordInputs) {
                          const itemInput = getItemInput(item);
                          if (itemInput) {
                            itemSpan.setAttributes({
                              [GEN_AI_TOOL_INPUT_ATTRIBUTE]: itemInput,
                            });
                          }
                        }

                        if (recordOutputs) {
                          const itemOutput = getItemOutput(item);
                          if (itemOutput) {
                            itemSpan.setAttributes({
                              [GEN_AI_TOOL_OUTPUT_ATTRIBUTE]: itemOutput,
                            });
                          }
                        }

                        // Check for error status
                        if (item.type === 'error' || ('status' in item && item.status === 'failed')) {
                          itemSpan.setStatus({
                            code: 2,
                            message: item.type === 'error' ? item.message : 'Tool execution failed',
                          });
                        } else {
                          itemSpan.setStatus({ code: 1 });
                        }
                      },
                    );
                  });
                }

                chatSpan.setStatus({ code: 1 });
                return turn;
              },
            );
          });

          agentSpan.setStatus({ code: 1 });
          return result;
        } catch (error) {
          captureException(error, {
            mechanism: {
              type: SENTRY_ORIGIN,
              handled: false,
            },
          });

          agentSpan.setStatus({ code: 2, message: (error as Error).message });
          throw error;
        }
      },
    );
}

/**
 * Wraps a Codex instance to add Sentry instrumentation to all threads
 */
export function instrumentCodexInstance(originalCodex: Codex, options: OpenAiCodexOptions = {}): Codex {
  const client = getClient();
  const defaultPii = Boolean(client?.getOptions().sendDefaultPii);

  const recordInputs = options.recordInputs ?? defaultPii;
  const recordOutputs = options.recordOutputs ?? defaultPii;
  const agentName = options.agentName ?? 'openai-codex';

  // Wrap startThread
  const originalStartThread = originalCodex.startThread.bind(originalCodex);
  originalCodex.startThread = function (threadOptions?: unknown): Thread {
    const thread = originalStartThread(threadOptions);
    return instrumentThread(thread, agentName, recordInputs, recordOutputs);
  };

  // Wrap resumeThread
  const originalResumeThread = originalCodex.resumeThread.bind(originalCodex);
  originalCodex.resumeThread = function (id: string, threadOptions?: unknown): Thread {
    const thread = originalResumeThread(id, threadOptions);
    return instrumentThread(thread, agentName, recordInputs, recordOutputs);
  };

  return originalCodex;
}

/**
 * Wraps the Codex constructor to automatically instrument all instances
 */
export function patchCodexConstructor(
  CodexConstructor: new (options?: CodexOptions) => Codex,
  instrumentationOptions: OpenAiCodexOptions = {},
): new (options?: CodexOptions) => Codex {
  return class InstrumentedCodex extends (CodexConstructor as any) {
    constructor(options?: CodexOptions) {
      super(options);
      return instrumentCodexInstance(this as unknown as Codex, instrumentationOptions);
    }
  } as new (options?: CodexOptions) => Codex;
}
