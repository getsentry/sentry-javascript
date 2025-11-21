import { instrumentOpenAiClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

class MockOpenAI {
  constructor(config) {
    this.apiKey = config.apiKey;

    this.responses = {
      create: async params => {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10));

        return {
          id: 'chatcmpl-responses-truncation-test',
          object: 'response',
          created_at: 1677652288,
          status: 'completed',
          error: null,
          incomplete_details: null,
          instructions: null,
          max_output_tokens: null,
          model: params.model,
          output: [
            {
              type: 'message',
              id: 'message-123',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'Response to truncated messages',
                  annotations: [],
                },
              ],
            },
          ],
          parallel_tool_calls: true,
          previous_response_id: null,
          reasoning: {
            effort: null,
            summary: null,
          },
          store: true,
          temperature: params.temperature,
          text: {
            format: {
              type: 'text',
            },
          },
          tool_choice: 'auto',
          tools: [],
          top_p: 1.0,
          truncation: 'disabled',
          usage: {
            input_tokens: 10,
            input_tokens_details: {
              cached_tokens: 0,
            },
            output_tokens: 15,
            output_tokens_details: {
              reasoning_tokens: 0,
            },
            total_tokens: 25,
          },
          user: null,
          metadata: {},
        };
      },
    };
  }
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new MockOpenAI({
      apiKey: 'mock-api-key',
    });

    const client = instrumentOpenAiClient(mockClient);

    // Create 1 large message that gets truncated to fit within the 20KB limit
    const largeContent = 'A'.repeat(25000) + 'B'.repeat(25000); // ~50KB gets truncated to include only As

    await client.responses.create({
      model: 'gpt-3.5-turbo',
      input: largeContent,
      temperature: 0.7,
    });
  });
}

run();
