import type { ANTHROPIC_AI_INSTRUMENTED_METHODS } from './constants';

export interface AnthropicAiOptions {
  /**
   * Enable or disable input recording.
   */
  recordInputs?: boolean;
  /**
   * Enable or disable output recording.
   */
  recordOutputs?: boolean;
}

export type Message = {
  role: 'user' | 'assistant';
  content: string | unknown[];
};

export type AnthropicAiResponse = {
  [key: string]: unknown; // Allow for additional unknown properties
  id: string;
  model: string;
  created: number;
  messages?: Array<Message>;
  content?: string; // Available for Messages.create
  completion?: string; // Available for Completions.create
  input_tokens?: number; // Available for Models.countTokens
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
};

/**
 * Basic interface for Anthropic AI client with only the instrumented methods
 * This provides type safety while being generic enough to work with different client implementations
 */
export interface AnthropicAiClient {
  messages?: {
    create: (...args: unknown[]) => Promise<AnthropicAiResponse>;
    countTokens: (...args: unknown[]) => Promise<AnthropicAiResponse>;
  };
  models?: {
    list: (...args: unknown[]) => Promise<AnthropicAiResponse>;
    get: (...args: unknown[]) => Promise<AnthropicAiResponse>;
  };
  completions?: {
    create: (...args: unknown[]) => Promise<AnthropicAiResponse>;
  };
}

/**
 * Anthropic AI Integration interface for type safety
 */
export interface AnthropicAiIntegration {
  name: string;
  options: AnthropicAiOptions;
}

export type AnthropicAiInstrumentedMethod = (typeof ANTHROPIC_AI_INSTRUMENTED_METHODS)[number];
