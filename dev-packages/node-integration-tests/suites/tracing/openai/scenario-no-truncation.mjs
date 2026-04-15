import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';

function startMockServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.post('/openai/chat/completions', (req, res) => {
    res.send({
      id: 'chatcmpl-mock123',
      object: 'chat.completion',
      created: 1677652288,
      model: req.body.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello!' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  });

  app.post('/openai/responses', (req, res) => {
    res.send({
      id: 'resp_mock456',
      object: 'response',
      created_at: 1677652290,
      model: req.body.model,
      output: [
        {
          type: 'message',
          id: 'msg_mock_output_1',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Response text', annotations: [] }],
        },
      ],
      output_text: 'Response text',
      status: 'completed',
      usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
    });
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

    // Multiple messages with long content (would normally be truncated and popped to last message only)
    const longContent = 'A'.repeat(50_000);
    await client.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'user', content: longContent },
        { role: 'assistant', content: 'Some reply' },
        { role: 'user', content: 'Follow-up question' },
      ],
    });

    // Responses API with long string input (would normally be truncated)
    const longStringInput = 'B'.repeat(50_000);
    await client.responses.create({
      model: 'gpt-4',
      input: longStringInput,
    });
  });

  // Flush is required when span streaming is enabled to ensure streamed spans are sent before the process exits
  await Sentry.flush();
  server.close();
}

run();
