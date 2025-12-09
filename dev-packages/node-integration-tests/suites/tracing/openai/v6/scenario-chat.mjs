import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';

function startMockServer() {
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
      // Streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const chunks = [
        {
          id: 'chatcmpl-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model: model,
          choices: [{ delta: { role: 'assistant', content: '' }, index: 0 }],
        },
        {
          id: 'chatcmpl-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model: model,
          choices: [{ delta: { content: 'Hello from OpenAI streaming!' }, index: 0 }],
        },
        {
          id: 'chatcmpl-stream-123',
          object: 'chat.completion.chunk',
          created: 1677652300,
          model: model,
          choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 18,
            total_tokens: 30,
          },
        },
      ];

      chunks.forEach((chunk, index) => {
        setTimeout(() => {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          if (index === chunks.length - 1) {
            res.write('data: [DONE]\n\n');
            res.end();
          }
        }, index * 10);
      });
    } else {
      // Non-streaming response
      res.send({
        id: 'chatcmpl-mock123',
        object: 'chat.completion',
        created: 1677652288,
        model: model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello from OpenAI mock!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
      });
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
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

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

      events.forEach((event, index) => {
        setTimeout(() => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          if (index === events.length - 1) {
            res.write('data: [DONE]\n\n');
            res.end();
          }
        }, index * 10);
      });
    } else {
      // Non-streaming response
      res.send({
        id: 'resp_mock456',
        object: 'response',
        created_at: 1677652290,
        model: model,
        output: [
          {
            type: 'message',
            id: 'msg_mock_output_1',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: `Response to: ${req.body.input}`,
                annotations: [],
              },
            ],
          },
        ],
        output_text: `Response to: ${req.body.input}`,
        status: 'completed',
        usage: {
          input_tokens: 5,
          output_tokens: 8,
          total_tokens: 13,
        },
      });
    }
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

async function run() {
  const server = await startMockServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new OpenAI({
      baseURL: `http://localhost:${server.address().port}/openai`,
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
  });

  server.close();
}

run();
