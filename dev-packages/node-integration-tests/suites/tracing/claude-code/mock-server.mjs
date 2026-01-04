/* eslint-disable no-console, max-lines */
/**
 * Mock implementation of @anthropic-ai/claude-agent-sdk
 * Simulates the query function behavior for testing
 *
 * Message format matches the real Claude Agent SDK:
 * - type: 'system' - Session initialization
 * - type: 'assistant' - LLM responses
 * - type: 'user' - Tool results
 * - type: 'result' - Final result
 */

let sessionCounter = 0;

export class MockClaudeAgentSdk {
  constructor(scenarios = {}) {
    this.scenarios = scenarios;
  }

  /**
   * Mock query function that returns an AsyncGenerator
   * @param {Object} params - Query parameters
   * @param {string} params.prompt - The prompt text
   * @param {Object} params.options - Query options
   * @param {string} params.options.model - Model to use
   * @param {Array} params.inputMessages - Previous conversation messages
   */
  query(params) {
    const generator = this._createGenerator(params);

    // Preserve special methods that Claude Code SDK provides
    generator.interrupt = () => {
      console.log('[Mock] interrupt() called');
    };

    generator.setPermissionMode = mode => {
      console.log('[Mock] setPermissionMode() called with:', mode);
    };

    return generator;
  }

  async *_createGenerator(params) {
    const model = params.options?.model || 'claude-sonnet-4-20250514';
    const sessionId = `sess_${Date.now()}_${++sessionCounter}`;
    const scenarioName = params.options?.scenario || 'basic';

    // Get scenario or use default
    const scenario = this.scenarios[scenarioName] || this._getBasicScenario(params);

    // Yield messages with small delays to simulate streaming
    for (const message of scenario.messages) {
      // Add small delay to simulate network
      await new Promise(resolve => setTimeout(resolve, message.delay || 5));

      // Inject session info and model where appropriate
      if (message.type === 'system') {
        yield { ...message, session_id: sessionId, model };
      } else if (message.type === 'assistant' && message.message) {
        // Inject model into assistant message if not present
        const messageData = message.message;
        if (!messageData.model) {
          messageData.model = model;
        }
        yield message;
      } else {
        yield message;
      }
    }
  }

  _getBasicScenario(params) {
    const responseId = `resp_${Date.now()}`;
    const usage = {
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: 5,
      cache_read_input_tokens: 3,
    };

    return {
      messages: [
        // Session initialization
        {
          type: 'system',
          session_id: 'will-be-replaced',
          model: 'will-be-replaced',
          conversation_history: params.inputMessages || [],
        },
        // Assistant response
        {
          type: 'assistant',
          message: {
            id: responseId,
            model: 'will-be-replaced',
            role: 'assistant',
            content: [{ type: 'text', text: 'I can help you with that.' }],
            stop_reason: 'end_turn',
            usage,
          },
        },
        // Final result (includes usage for final tallying)
        {
          type: 'result',
          result: 'I can help you with that.',
          usage,
        },
      ],
    };
  }
}

/**
 * Predefined scenarios for different test cases
 */
export const SCENARIOS = {
  basic: {
    messages: [
      {
        type: 'system',
        session_id: 'will-be-replaced',
        conversation_history: [],
      },
      {
        type: 'assistant',
        message: {
          id: 'resp_basic_123',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello! How can I help you today?' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 15,
            output_tokens: 25,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 10,
          },
        },
      },
      {
        type: 'result',
        result: 'Hello! How can I help you today?',
        usage: {
          input_tokens: 15,
          output_tokens: 25,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 10,
        },
      },
    ],
  },

  withTools: {
    messages: [
      {
        type: 'system',
        session_id: 'will-be-replaced',
        conversation_history: [],
      },
      // First LLM turn - makes a tool call
      {
        type: 'assistant',
        message: {
          id: 'resp_tool_1',
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me read that file for you.' },
            {
              type: 'tool_use',
              id: 'tool_read_1',
              name: 'Read',
              input: { file_path: '/test.txt' },
            },
          ],
          stop_reason: 'tool_use',
          usage: {
            input_tokens: 20,
            output_tokens: 15,
            cache_creation_input_tokens: 5,
            cache_read_input_tokens: 0,
          },
        },
      },
      // Tool result comes back
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_read_1',
              content: 'File contents: Hello World',
            },
          ],
        },
      },
      // Second LLM turn - processes tool result
      {
        type: 'assistant',
        message: {
          id: 'resp_tool_2',
          role: 'assistant',
          content: [{ type: 'text', text: 'The file contains "Hello World".' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 30,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 15,
          },
        },
      },
      {
        type: 'result',
        result: 'The file contains "Hello World".',
        usage: {
          input_tokens: 50, // Cumulative: 20 + 30
          output_tokens: 35, // Cumulative: 15 + 20
          cache_creation_input_tokens: 5,
          cache_read_input_tokens: 15,
        },
      },
    ],
  },

  multipleTools: {
    messages: [
      {
        type: 'system',
        session_id: 'will-be-replaced',
        conversation_history: [],
      },
      // First tool call - Glob
      {
        type: 'assistant',
        message: {
          id: 'resp_multi_1',
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me find the JavaScript files.' },
            {
              type: 'tool_use',
              id: 'tool_glob_1',
              name: 'Glob',
              input: { pattern: '*.js' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_glob_1',
              content: 'test.js\nindex.js',
            },
          ],
        },
      },
      // Second tool call - Read
      {
        type: 'assistant',
        message: {
          id: 'resp_multi_2',
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me read the first file.' },
            {
              type: 'tool_use',
              id: 'tool_read_1',
              name: 'Read',
              input: { file_path: 'test.js' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 15, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 5 },
        },
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_read_1',
              content: 'console.log("test")',
            },
          ],
        },
      },
      // Final response
      {
        type: 'assistant',
        message: {
          id: 'resp_multi_3',
          role: 'assistant',
          content: [{ type: 'text', text: 'Found 2 JavaScript files.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 20, output_tokens: 15, cache_creation_input_tokens: 0, cache_read_input_tokens: 10 },
        },
      },
      {
        type: 'result',
        result: 'Found 2 JavaScript files.',
        usage: {
          input_tokens: 45, // Cumulative: 10 + 15 + 20
          output_tokens: 35, // Cumulative: 10 + 10 + 15
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 15, // Cumulative: 0 + 5 + 10
        },
      },
    ],
  },

  extensionTools: {
    messages: [
      {
        type: 'system',
        session_id: 'will-be-replaced',
        conversation_history: [],
      },
      {
        type: 'assistant',
        message: {
          id: 'resp_ext_1',
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me search for that.' },
            {
              type: 'tool_use',
              id: 'tool_search_1',
              name: 'WebSearch',
              input: { query: 'Sentry error tracking' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 15, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_search_1',
              content: 'Found 3 results about Sentry',
            },
          ],
        },
      },
      {
        type: 'assistant',
        message: {
          id: 'resp_ext_2',
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me fetch the main page.' },
            {
              type: 'tool_use',
              id: 'tool_fetch_1',
              name: 'WebFetch',
              input: { url: 'https://sentry.io' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 20, output_tokens: 15, cache_creation_input_tokens: 0, cache_read_input_tokens: 5 },
        },
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_fetch_1',
              content: '<html>...</html>',
            },
          ],
        },
      },
      {
        type: 'assistant',
        message: {
          id: 'resp_ext_3',
          role: 'assistant',
          content: [{ type: 'text', text: 'Sentry is an error tracking platform.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 25, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 10 },
        },
      },
      {
        type: 'result',
        result: 'Sentry is an error tracking platform.',
        usage: {
          input_tokens: 60, // Cumulative: 15 + 20 + 25
          output_tokens: 45, // Cumulative: 10 + 15 + 20
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 15, // Cumulative: 0 + 5 + 10
        },
      },
    ],
  },

  agentError: {
    messages: [
      {
        type: 'system',
        session_id: 'will-be-replaced',
        conversation_history: [],
      },
      // Error during agent operation
      {
        type: 'error',
        error: new Error('Agent initialization failed'),
        code: 'AGENT_INIT_ERROR',
        delay: 10,
      },
    ],
  },

  llmError: {
    messages: [
      {
        type: 'system',
        session_id: 'will-be-replaced',
        conversation_history: [],
      },
      // Error during LLM call
      {
        type: 'error',
        error: new Error('Rate limit exceeded'),
        code: 'RATE_LIMIT_ERROR',
        statusCode: 429,
        delay: 10,
      },
    ],
  },

  toolError: {
    messages: [
      {
        type: 'system',
        session_id: 'will-be-replaced',
        conversation_history: [],
      },
      {
        type: 'assistant',
        message: {
          id: 'resp_tool_err_1',
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me run that command.' },
            {
              type: 'tool_use',
              id: 'tool_bash_1',
              name: 'Bash',
              input: { command: 'invalid_command' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_bash_1',
              content: 'Command not found: invalid_command',
              is_error: true,
            },
          ],
        },
      },
      {
        type: 'assistant',
        message: {
          id: 'resp_tool_err_2',
          role: 'assistant',
          content: [{ type: 'text', text: 'The command failed to execute.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 15, output_tokens: 15, cache_creation_input_tokens: 0, cache_read_input_tokens: 5 },
        },
      },
      {
        type: 'result',
        result: 'The command failed to execute.',
        usage: {
          input_tokens: 25, // Cumulative: 10 + 15
          output_tokens: 25, // Cumulative: 10 + 15
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 5,
        },
      },
    ],
  },
};

/**
 * Helper to create a mock SDK instance with predefined scenarios
 */
export function createMockSdk() {
  return new MockClaudeAgentSdk(SCENARIOS);
}
