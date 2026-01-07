import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';

function startMockServer() {
  const app = express();
  app.use(express.json());

  // Conversations API endpoint - create conversation
  app.post('/openai/conversations', (req, res) => {
    res.send({
      id: 'conv_689667905b048191b4740501625afd940c7533ace33a2dab',
      object: 'conversation',
      created_at: 1704067200,
      metadata: {},
    });
  });

  // Responses API endpoint - with conversation support
  app.post('/openai/responses', (req, res) => {
    const { model, conversation, previous_response_id } = req.body;

    res.send({
      id: 'resp_mock_conv_123',
      object: 'response',
      created_at: 1704067210,
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
              text: `Response with conversation: ${conversation || 'none'}, previous_response_id: ${previous_response_id || 'none'}`,
              annotations: [],
            },
          ],
        },
      ],
      output_text: `Response with conversation: ${conversation || 'none'}`,
      status: 'completed',
      usage: {
        input_tokens: 10,
        output_tokens: 15,
        total_tokens: 25,
      },
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

  await Sentry.startSpan({ op: 'function', name: 'conversation-test' }, async () => {
    const client = new OpenAI({
      baseURL: `http://localhost:${server.address().port}/openai`,
      apiKey: 'mock-api-key',
    });

    // Test 1: Create a conversation
    const conversation = await client.conversations.create();

    // Test 2: Use conversation ID in responses.create
    await client.responses.create({
      model: 'gpt-4',
      input: 'Hello, this is a conversation test',
      conversation: conversation.id,
    });

    // Test 3: Use previous_response_id for chaining (without formal conversation)
    const firstResponse = await client.responses.create({
      model: 'gpt-4',
      input: 'Tell me a joke',
    });

    await client.responses.create({
      model: 'gpt-4',
      input: 'Explain why that is funny',
      previous_response_id: firstResponse.id,
    });
  });

  server.close();
}

run();
