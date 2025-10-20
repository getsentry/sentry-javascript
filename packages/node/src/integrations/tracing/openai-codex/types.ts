/**
 * Type definitions for OpenAI Codex SDK integration
 * Based on @openai/codex-sdk types
 */

export interface CodexOptions {
  [key: string]: unknown;
  apiKey?: string;
}

export interface ThreadOptions {
  [key: string]: unknown;
  workingDirectory?: string;
  skipGitRepoCheck?: boolean;
}

export interface TurnOptions {
  [key: string]: unknown;
  outputSchema?: unknown;
}

export interface Usage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

// Thread Item Types
export type ThreadItemType =
  | 'agent_message'
  | 'reasoning'
  | 'command_execution'
  | 'file_change'
  | 'mcp_tool_call'
  | 'web_search'
  | 'todo_list'
  | 'error';

export interface BaseThreadItem {
  id: string;
  type: ThreadItemType;
}

export interface AgentMessageItem extends BaseThreadItem {
  type: 'agent_message';
  text: string;
}

export interface ReasoningItem extends BaseThreadItem {
  type: 'reasoning';
  text: string;
}

export interface CommandExecutionItem extends BaseThreadItem {
  type: 'command_execution';
  command: string;
  aggregated_output: string;
  exit_code?: number;
  status: 'in_progress' | 'completed' | 'failed';
}

export interface FileChangeItem extends BaseThreadItem {
  type: 'file_change';
  changes: unknown[];
  status: 'completed' | 'failed';
}

export interface McpToolCallItem extends BaseThreadItem {
  type: 'mcp_tool_call';
  server: string;
  tool: string;
  status: 'in_progress' | 'completed' | 'failed';
}

export interface WebSearchItem extends BaseThreadItem {
  type: 'web_search';
  query: string;
}

export interface TodoListItem extends BaseThreadItem {
  type: 'todo_list';
  items: unknown[];
}

export interface ErrorItem extends BaseThreadItem {
  type: 'error';
  message: string;
}

export type ThreadItem =
  | AgentMessageItem
  | ReasoningItem
  | CommandExecutionItem
  | FileChangeItem
  | McpToolCallItem
  | WebSearchItem
  | TodoListItem
  | ErrorItem;

// Thread Events
export interface ThreadStartedEvent {
  type: 'thread.started';
  thread_id: string;
}

export interface TurnStartedEvent {
  type: 'turn.started';
}

export interface TurnCompletedEvent {
  type: 'turn.completed';
  usage: Usage;
}

export interface TurnFailedEvent {
  type: 'turn.failed';
  error: {
    message: string;
  };
}

export interface ItemStartedEvent {
  type: 'item.started';
  item: ThreadItem;
}

export interface ItemUpdatedEvent {
  type: 'item.updated';
  item: ThreadItem;
}

export interface ItemCompletedEvent {
  type: 'item.completed';
  item: ThreadItem;
}

export interface ThreadErrorEvent {
  type: 'error';
  message: string;
}

export type ThreadEvent =
  | ThreadStartedEvent
  | TurnStartedEvent
  | TurnCompletedEvent
  | TurnFailedEvent
  | ItemStartedEvent
  | ItemUpdatedEvent
  | ItemCompletedEvent
  | ThreadErrorEvent;

// SDK Classes
export interface Thread {
  id: string | null;
  run(input: string, turnOptions?: TurnOptions): Promise<Turn>;
  runStreamed(input: string, turnOptions?: TurnOptions): Promise<StreamedTurn>;
}

export interface Turn {
  items: ThreadItem[];
  finalResponse: string;
}

export interface StreamedTurn {
  events: AsyncGenerator<ThreadEvent>;
}

export interface Codex {
  startThread(options?: ThreadOptions): Thread;
  resumeThread(id: string, options?: ThreadOptions): Thread;
}

export interface CodexConstructor {
  new (options?: CodexOptions): Codex;
}

// Integration Options
export interface OpenAiCodexOptions {
  /**
   * Whether to record input prompts.
   * Defaults to Sentry client's `sendDefaultPii` setting.
   */
  recordInputs?: boolean;

  /**
   * Whether to record response text, tool calls, and tool outputs.
   * Defaults to Sentry client's `sendDefaultPii` setting.
   */
  recordOutputs?: boolean;

  /**
   * Custom agent name to use for this integration.
   * This allows you to differentiate between multiple Codex agents in your application.
   * Defaults to 'openai-codex'.
   */
  agentName?: string;
}
