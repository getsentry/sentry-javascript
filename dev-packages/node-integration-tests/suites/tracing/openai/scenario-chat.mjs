import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';
import {
  openAiChatCompletion,
  openAiChatCompletionChunks,
  openAiResponse,
  startMockServer,
  streamSseEvents,
} from '@sentry-internal/node-integration-tests';

function startMockApi() {
  const app = express();
  app.use(express.json());

  // Chat completions endpoint
  app.post('/openai/chat/completions', (req, res) => {
    const { model, stream } = req.body;

    // Handle error model
    if (model === 'error-model') {
      res.status(500).set('x-request-id', 'mock-request-error').end('Internal server error');
      return;
    }

    if (stream) {
      // Gemini's OpenAI-compatible endpoint streams whole, parallel tool calls without an `index`
      const geminiToolCallChunks = [
        {
          id: 'chatcmpl-stream-gemini-456',
          object: 'chat.completion.chunk',
          created: 1677652305,
          model: model,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    id: 'call_paris',
                    type: 'function',
                    function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
                  },
                  {
                    id: 'call_london',
                    type: 'function',
                    function: { name: 'get_weather', arguments: '{"city":"London"}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 25,
            total_tokens: 40,
          },
        },
      ];

      const chunks = model === 'gemini-compat' ? geminiToolCallChunks : openAiChatCompletionChunks(model);

      streamSseEvents(res, chunks, { done: true });
    } else {
      res.send(openAiChatCompletion(model));
    }
  });

  // Responses API endpoint
  app.post('/openai/responses', (req, res) => {
    const { model, stream } = req.body;

    // Handle error model
    if (model === 'error-model') {
      res.status(500).set('x-request-id', 'mock-request-error').end('Internal server error');
      return;
    }

    if (stream) {
      // Streaming response - using event-based format with 'response' field

      const events = [
        {
          type: 'response.created',
          response: {
            id: 'resp_stream_456',
            object: 'response',
            created_at: 1677652310,
            model: model,
            status: 'in_progress',
          },
        },
        {
          type: 'response.output_text.delta',
          delta: 'Streaming response to: Test streaming responses API',
          response: {
            id: 'resp_stream_456',
            model: model,
            created_at: 1677652310,
          },
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp_stream_456',
            object: 'response',
            created_at: 1677652310,
            model: model,
            status: 'completed',
            output_text: 'Test streaming responses API',
            usage: {
              input_tokens: 6,
              output_tokens: 10,
              total_tokens: 16,
            },
          },
        },
      ];

      streamSseEvents(res, events, { done: true });
    } else {
      // Non-streaming response
      res.send(openAiResponse(model, { text: `Response to: ${req.body.input}` }));
    }
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockApi();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new OpenAI({
      baseURL: `${server.url}/openai`,
      apiKey: 'mock-api-key',
    });

    // First test: basic chat completion
    await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
      ],
      temperature: 0.7,
      max_tokens: 100,
    });

    // Second test: responses API
    await client.responses.create({
      model: 'gpt-3.5-turbo',
      input: 'Translate this to French: Hello',
      instructions: 'You are a translator',
    });

    // Third test: error handling in chat completions
    try {
      await client.chat.completions.create({
        model: 'error-model',
        messages: [{ role: 'user', content: 'This will fail' }],
      });
    } catch {
      // Error is expected and handled
    }

    // Fourth test: chat completions streaming
    const stream1 = await client.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Tell me about streaming' },
      ],
      stream: true,
      temperature: 0.8,
    });

    // Consume the stream to trigger span instrumentation
    for await (const chunk of stream1) {
      // Stream chunks are processed automatically by instrumentation
      void chunk; // Prevent unused variable warning
    }

    // Streaming whole parallel tool calls without an index (Gemini style)
    const geminiStream = await client.chat.completions.create({
      model: 'gemini-compat',
      messages: [{ role: 'user', content: 'Weather in Paris and London?' }],
      stream: true,
    });

    for await (const chunk of geminiStream) {
      void chunk;
    }

    // Fifth test: responses API streaming
    const stream2 = await client.responses.create({
      model: 'gpt-4',
      input: 'Test streaming responses API',
      instructions: 'You are a streaming assistant',
      stream: true,
    });

    for await (const chunk of stream2) {
      void chunk;
    }

    // Sixth test: error handling in streaming context
    try {
      const errorStream = await client.chat.completions.create({
        model: 'error-model',
        messages: [{ role: 'user', content: 'This will fail' }],
        stream: true,
      });

      // Try to consume the stream (this should not execute)
      for await (const chunk of errorStream) {
        void chunk;
      }
    } catch {
      // Error is expected and handled
    }

    // scenario: parse responses
    await client.chat.completions.parse({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
    });

    await client.responses.parse({
      model: 'gpt-4o',
      input: 'What is the capital of France?',
    });
  });

  server.close();
}

run();
